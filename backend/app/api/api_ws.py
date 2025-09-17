from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette import status as ws_status
from starlette.exceptions import WebSocketException

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Set

# Custom WebSocket close codes mirroring HTTP status codes
WS_4401_UNAUTHORIZED = 4401

try:  # Optional Redis support
    from redis import asyncio as aioredis
except Exception:  # pragma: no cover - redis is optional
    aioredis = None

from .dependencies import get_db
from ..crud import crud_booking_request
from ..models.user import User
from .auth import ALGORITHM, SECRET_KEY, get_user_by_email

logger = logging.getLogger(__name__)

router = APIRouter()


REDIS_URL = os.getenv("WEBSOCKET_REDIS_URL")
redis = aioredis.from_url(REDIS_URL) if aioredis and REDIS_URL else None

PING_INTERVAL = 30
PONG_TIMEOUT = 10
SEND_TIMEOUT = 1


class ConnectionManager:
    """Manage per-booking WebSocket rooms and helper tasks."""

    def __init__(self) -> None:
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.typing_buffers: Dict[int, Set[int]] = {}
        self.typing_tasks: Dict[int, asyncio.Task] = {}
        self.redis_tasks: Dict[int, asyncio.Task] = {}
        self.presence_buffers: Dict[int, Dict[int, str]] = {}
        self.presence_tasks: Dict[int, asyncio.Task] = {}

    async def _redis_subscribe(self, request_id: int) -> None:
        assert redis
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"ws:{request_id}")
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                except Exception:
                    continue
                await self.broadcast(request_id, data, publish=False)
        finally:  # pragma: no cover - network cleanup
            await pubsub.unsubscribe(f"ws:{request_id}")
            await pubsub.close()

    async def connect(self, request_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        websocket.last_pong = time.time()
        self.active_connections.setdefault(request_id, []).append(websocket)
        if redis and request_id not in self.redis_tasks:
            self.redis_tasks[request_id] = asyncio.create_task(
                self._redis_subscribe(request_id)
            )

    def disconnect(self, request_id: int, websocket: WebSocket) -> None:
        conns = self.active_connections.get(request_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                del self.active_connections[request_id]
                task = self.redis_tasks.pop(request_id, None)
                if task:
                    task.cancel()

    async def broadcast(
        self, request_id: int, message: Any, publish: bool = True
    ) -> None:
        payload = jsonable_encoder(message)
        if publish and redis:
            await redis.publish(f"ws:{request_id}", json.dumps(payload))
        # Fan out to multiplex topic subscribers in this process
        try:
            await multiplex_manager.broadcast_topic(
                f"booking-requests:{request_id}",
                payload,
                publish=publish,
            )
        except Exception:
            pass
        for ws in list(self.active_connections.get(request_id, [])):
            try:
                await asyncio.wait_for(ws.send_json(payload), timeout=SEND_TIMEOUT)
            except asyncio.TimeoutError:
                logger.warning(
                    "Closing slow WebSocket for request %s due to backpressure",
                    request_id,
                )
                try:
                    await ws.close(
                        code=ws_status.WS_1011_INTERNAL_ERROR, reason="backpressure"
                    )
                finally:
                    self.disconnect(request_id, ws)
            except Exception:
                # Client likely disconnected abruptly; drop silently to avoid noisy traces
                try:
                    await ws.close()
                except Exception:
                    pass
                self.disconnect(request_id, ws)

    async def add_typing(self, request_id: int, user_id: int) -> None:
        buf = self.typing_buffers.setdefault(request_id, set())
        buf.add(user_id)
        if request_id not in self.typing_tasks:
            self.typing_tasks[request_id] = asyncio.create_task(
                self._flush_typing(request_id)
            )

    async def _flush_typing(self, request_id: int) -> None:
        await asyncio.sleep(0.3)
        users = list(self.typing_buffers.pop(request_id, set()))
        self.typing_tasks.pop(request_id, None)
        if users:
            await self.broadcast(request_id, {"v": 1, "type": "typing", "users": users})

    async def add_presence(self, request_id: int, user_id: int, status: str) -> None:
        buf = self.presence_buffers.setdefault(request_id, {})
        buf[user_id] = status
        if request_id not in self.presence_tasks:
            self.presence_tasks[request_id] = asyncio.create_task(
                self._flush_presence(request_id)
            )

    async def _flush_presence(self, request_id: int) -> None:
        await asyncio.sleep(1)
        updates = self.presence_buffers.pop(request_id, {})
        self.presence_tasks.pop(request_id, None)
        if updates:
            await self.broadcast(request_id, {"v": 1, "type": "presence", "updates": updates})


manager = ConnectionManager()


class NotificationManager:
    """Track WebSocket connections per user for real-time notifications."""

    def __init__(self) -> None:
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        websocket.last_pong = time.time()
        self.active_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        conns = self.active_connections.get(user_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                del self.active_connections[user_id]

    async def broadcast(self, user_id: int, message: Any) -> None:
        payload = jsonable_encoder(message)
        # Publish to Redis for SSE/multiplex consumers
        if redis:
            try:
                publish_payload = payload
                if isinstance(publish_payload, dict):
                    publish_payload = {
                        "v": publish_payload.get("v", 1),
                        "type": publish_payload.get("type"),
                        "topic": publish_payload.get(
                            "topic", f"notifications:{user_id}"
                        ),
                        **publish_payload,
                    }
                await redis.publish(
                    f"ws-topic:notifications:{user_id}",
                    json.dumps(publish_payload),
                )
            except Exception:
                pass
        # Fan out to multiplex sockets in this process
        try:
            await multiplex_manager.broadcast_topic(
                f"notifications:{user_id}", payload, publish=False
            )
        except Exception:
            pass
        for ws in list(self.active_connections.get(user_id, [])):
            try:
                await asyncio.wait_for(ws.send_json(payload), timeout=SEND_TIMEOUT)
            except asyncio.TimeoutError:
                logger.warning(
                    "Closing slow notification WebSocket for user %s", user_id
                )
                try:
                    await ws.close(
                        code=ws_status.WS_1011_INTERNAL_ERROR, reason="backpressure"
                    )
                finally:
                    self.disconnect(user_id, ws)


notifications_manager = NotificationManager()


class MultiplexManager:
    """Single-socket multiplex: topic subscribe/unsubscribe + fanout.

    Topics:
      - booking-requests:<id>
      - notifications (user-scoped; server resolves user_id)
      - notifications:<user_id> (optional explicit form)
    """

    def __init__(self) -> None:
        self.topic_sockets: Dict[str, List[WebSocket]] = {}
        self.socket_topics: Dict[WebSocket, Set[str]] = {}

    async def subscribe(self, websocket: WebSocket, topic: str) -> None:
        self.topic_sockets.setdefault(topic, []).append(websocket)
        self.socket_topics.setdefault(websocket, set()).add(topic)

    async def unsubscribe(self, websocket: WebSocket, topic: str) -> None:
        lst = self.topic_sockets.get(topic)
        if lst and websocket in lst:
            lst.remove(websocket)
            if not lst:
                del self.topic_sockets[topic]
        if websocket in self.socket_topics:
            self.socket_topics[websocket].discard(topic)

    async def disconnect(self, websocket: WebSocket) -> None:
        topics = list(self.socket_topics.get(websocket, set()))
        for t in topics:
            await self.unsubscribe(websocket, t)
        self.socket_topics.pop(websocket, None)

    async def broadcast_topic(self, topic: str, message: Any, publish: bool = True) -> None:
        # Publish cross-process via Redis if available
        payload = jsonable_encoder(message)
        if publish and redis:
            try:
                publish_payload = payload
                if isinstance(publish_payload, dict):
                    publish_payload = {
                        "v": publish_payload.get("v", 1),
                        "type": publish_payload.get("type"),
                        "topic": publish_payload.get("topic", topic),
                        **publish_payload,
                    }
                await redis.publish(
                    f"ws-topic:{topic}", json.dumps(publish_payload)
                )
            except Exception:
                pass
        # Local sockets
        for ws in list(self.topic_sockets.get(topic, [])):
            try:
                data = {
                    "v": 1,
                    "topic": topic,
                }
                if isinstance(payload, dict):
                    data.update(payload)
                else:
                    data["payload"] = payload
                await asyncio.wait_for(ws.send_json(data), timeout=SEND_TIMEOUT)
            except Exception:
                try:
                    await ws.close()
                except Exception:
                    pass
                await self.disconnect(ws)


multiplex_manager = MultiplexManager()


@router.websocket("/ws/booking-requests/{request_id}")
async def booking_request_ws(
    websocket: WebSocket,
    request_id: int,
    token: str | None = Query(None),
    attempt: int = Query(0),
    heartbeat: int = Query(PING_INTERVAL),
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for booking-specific chat rooms."""

    user: User | None = None
    # Accept cookie-based auth when query token is missing
    if not token:
        token = websocket.cookies.get("access_token")
    if not token:
        logger.warning("Rejecting WebSocket for request %s: missing token", request_id)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email:
            user = get_user_by_email(db, email)
    except JWTError:
        logger.warning("Rejecting WebSocket for request %s: invalid token", request_id)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")
    if not user:
        logger.warning("Rejecting WebSocket for request %s: user not found", request_id)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")
    booking_request = crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not booking_request:
        logger.warning(
            "Rejecting WebSocket for request %s: booking request not found", request_id
        )
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Request not found")

    if user and user.id not in [booking_request.client_id, booking_request.artist_id]:
        logger.warning(
            "Rejecting WebSocket for request %s: unauthorized user %s",
            request_id,
            user.id,
        )
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Unauthorized")

    await manager.connect(request_id, websocket)
    reconnect_delay = min(2**attempt, 30)
    websocket.ping_interval = max(heartbeat, PING_INTERVAL)
    # Best effort hint; ignore if client closed immediately during mount/unmount
    try:
        await websocket.send_json({"v": 1, "type": "reconnect_hint", "delay": reconnect_delay})
    except Exception:
        manager.disconnect(request_id, websocket)
        return

    async def ping_loop() -> None:
        while True:
            await asyncio.sleep(websocket.ping_interval)
            try:
                await websocket.send_json({"v": 1, "type": "ping"})
            except Exception:  # pragma: no cover - connection closed
                break
            await asyncio.sleep(PONG_TIMEOUT)
            if time.time() - websocket.last_pong > PONG_TIMEOUT:
                logger.info(
                    "Closing stale WebSocket for request %s due to heartbeat timeout",
                    request_id,
                )
                try:
                    await websocket.send_json({"v": 1, "type": "reconnect", "delay": reconnect_delay})
                except Exception:
                    pass
                await websocket.close(
                    code=ws_status.WS_1011_INTERNAL_ERROR,
                    reason="heartbeat timeout",
                )
                break

    ping_task = asyncio.create_task(ping_loop())

    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                continue
            # Envelope version (default to 1 for backward compatibility)
            version = data.get("v", 1)
            if version != 1:
                # Silently ignore unsupported versions
                continue
            msg_type = data.get("type")

            # Allowlist supported message types only
            if msg_type == "pong":
                websocket.last_pong = time.time()
                continue

            if msg_type == "heartbeat":
                interval = data.get("interval")
                if isinstance(interval, (int, float)) and interval >= PING_INTERVAL:
                    websocket.ping_interval = float(interval)
                continue

            if msg_type == "typing":
                user_id = data.get("user_id")
                if isinstance(user_id, int):
                    await manager.add_typing(request_id, user_id)
                continue

            if msg_type == "presence":
                # Accept both single update {user_id, status}
                # and batched updates {updates: {<user_id>: <status>, ...}}
                if isinstance(data.get("updates"), dict):
                    for uid_str, st in data.get("updates", {}).items():
                        try:
                            uid = int(uid_str)
                        except (TypeError, ValueError):
                            continue
                        if isinstance(st, str):
                            await manager.add_presence(request_id, uid, st)
                else:
                    user_id = data.get("user_id")
                    status = data.get("status")
                    if isinstance(user_id, int) and isinstance(status, str):
                        await manager.add_presence(request_id, user_id, status)
                continue

            if msg_type == "read":
                # Live read receipt: { v:1, type:'read', up_to_id:int }
                up_to_id = data.get("up_to_id")
                if isinstance(up_to_id, int):
                    try:
                        await manager.broadcast(
                            request_id,
                            {"v": 1, "type": "read", "up_to_id": up_to_id, "user_id": user.id},
                        )
                    except Exception:
                        pass
                continue

            # Drop any other / unknown message types (no generic echo)
            continue
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        manager.disconnect(request_id, websocket)


@router.websocket("/ws")
async def multiplex_ws(
    websocket: WebSocket,
    token: str | None = Query(None),
    attempt: int = Query(0),
    heartbeat: int = Query(PING_INTERVAL),
    db: Session = Depends(get_db),
):
    """Single WebSocket connection supporting topic subscribe/unsubscribe."""
    user: User | None = None
    if not token:
        token = websocket.cookies.get("access_token")
    if not token:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email:
            user = get_user_by_email(db, email)
    except JWTError:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")
    if not user:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")

    await websocket.accept()
    websocket.last_pong = time.time()
    reconnect_delay = min(2**attempt, 30)
    websocket.ping_interval = max(heartbeat, PING_INTERVAL)
    try:
        await websocket.send_json({"v": 1, "type": "reconnect_hint", "delay": reconnect_delay})
    except Exception:
        await websocket.close()
        return

    async def ping_loop() -> None:
        while True:
            await asyncio.sleep(websocket.ping_interval)
            try:
                await websocket.send_json({"v": 1, "type": "ping"})
            except Exception:
                break
            await asyncio.sleep(PONG_TIMEOUT)
            if time.time() - websocket.last_pong > PONG_TIMEOUT:
                try:
                    await websocket.send_json({"v": 1, "type": "reconnect", "delay": reconnect_delay})
                except Exception:
                    pass
                await websocket.close(
                    code=ws_status.WS_1011_INTERNAL_ERROR,
                    reason="heartbeat timeout",
                )
                break

    ping_task = asyncio.create_task(ping_loop())

    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                continue
            v = data.get("v", 1)
            if v != 1:
                continue
            t = data.get("type")
            if t == "pong":
                websocket.last_pong = time.time()
                continue
            if t == "heartbeat":
                interval = data.get("interval")
                if isinstance(interval, (int, float)) and interval >= PING_INTERVAL:
                    websocket.ping_interval = float(interval)
                continue
            if t == "subscribe":
                topic = str(data.get("topic") or "").strip()
                if not topic:
                    continue
                # Authorization: notifications is user-scoped; booking-requests requires participant
                if topic == "notifications" or topic == f"notifications:{user.id}":
                    await multiplex_manager.subscribe(websocket, f"notifications:{user.id}")
                elif topic.startswith("booking-requests:"):
                    try:
                        req_id = int(topic.split(":", 1)[1])
                    except Exception:
                        continue
                    br = crud_booking_request.get_booking_request(db, request_id=req_id)
                    if not br or user.id not in [br.client_id, br.artist_id]:
                        continue
                    await multiplex_manager.subscribe(websocket, topic)
                continue
            if t == "unsubscribe":
                topic = str(data.get("topic") or "").strip()
                if not topic:
                    continue
                if topic == "notifications" or topic == f"notifications:{user.id}":
                    await multiplex_manager.unsubscribe(websocket, f"notifications:{user.id}")
                elif topic.startswith("booking-requests:"):
                    await multiplex_manager.unsubscribe(websocket, topic)
                continue
            # Scoped events must specify topic
            topic = str(data.get("topic") or "").strip()
            if not topic:
                continue
            # Forward limited control events to the respective managers
            if t == "typing":
                if topic.startswith("booking-requests:"):
                    try:
                        uid = int(data.get("user_id"))
                    except Exception:
                        uid = None
                    if isinstance(uid, int):
                        req_id = int(topic.split(":", 1)[1])
                        await manager.add_typing(req_id, uid)
                continue
            if t == "presence":
                if topic.startswith("booking-requests:"):
                    req_id = int(topic.split(":", 1)[1])
                    updates = data.get("updates")
                    if isinstance(updates, dict):
                        for uid_str, st in updates.items():
                            try:
                                uid = int(uid_str)
                            except (TypeError, ValueError):
                                continue
                            if isinstance(st, str):
                                await manager.add_presence(req_id, uid, st)
                    else:
                        uid = data.get("user_id")
                        st = data.get("status")
                        if isinstance(uid, int) and isinstance(st, str):
                            await manager.add_presence(req_id, uid, st)
                continue
            if t == "read":
                if topic.startswith("booking-requests:"):
                    req_id = int(topic.split(":", 1)[1])
                    up_to_id = data.get("up_to_id")
                    if isinstance(up_to_id, int):
                        await multiplex_manager.broadcast_topic(
                            topic,
                            {"v": 1, "type": "read", "up_to_id": up_to_id, "user_id": user.id, "topic": topic},
                            publish=True,
                        )
                continue
            # Ignore all other types
            continue
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        await multiplex_manager.disconnect(websocket)


@router.get("/sse")
async def sse(
    token: str | None = Query(None),
    topics: str = Query(""),
    db: Session = Depends(get_db),
):
    """Server-Sent Events endpoint for receive-only fallback.

    Requires Redis for cross-process fanout. Topics are comma-separated and
    include: booking-requests:<id>, notifications
    """
    if not aioredis or not redis:
        from fastapi import Response
        return Response(status_code=503)

    user: User | None = None
    if not token:
        # Try cookie auth (if front-end runs on same site)
        # Note: cannot access cookies directly here without request; keep as token for now
        pass
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email = payload.get("sub")
            if email:
                user = get_user_by_email(db, email)
        except JWTError:
            user = None
    # Best-effort auth for notifications topic; booking topics still public stream of room events

    selected = [t.strip() for t in (topics or "").split(",") if t.strip()]
    chan_names: List[str] = []
    topic_map: Dict[str, str] = {}
    for t in selected:
        if t.startswith("booking-requests:"):
            try:
                req_id = int(t.split(":", 1)[1])
            except Exception:
                continue
            chan = f"ws:{req_id}"
            chan_names.append(chan)
            topic_map[chan] = t
        elif t == "notifications" and user:
            chan = f"ws-topic:notifications:{user.id}"
            chan_names.append(chan)
            topic_map[chan] = f"notifications:{user.id}"

    async def event_generator():
        pubsub = redis.pubsub()
        await pubsub.subscribe(*chan_names)
        try:
            # Initial comment to open the stream
            yield b":ok\n\n"
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                chan = message.get("channel")
                if isinstance(chan, bytes):
                    chan = chan.decode()
                raw = message.get("data")
                try:
                    data = json.loads(raw)
                except Exception:
                    data = {"payload": raw.decode() if isinstance(raw, bytes) else str(raw)}
                # Ensure topic present for client routing
                topic = topic_map.get(chan, None)
                if topic and isinstance(data, dict):
                    data.setdefault("v", 1)
                    data.setdefault("topic", topic)
                chunk = ("data: " + json.dumps(data) + "\n\n").encode()
                yield chunk
        finally:
            try:
                await pubsub.unsubscribe(*chan_names)
                await pubsub.close()
            except Exception:
                pass

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    )


@router.websocket("/ws/notifications")
async def notifications_ws(
    websocket: WebSocket,
    token: str | None = Query(None),
    attempt: int = Query(0),
    heartbeat: int = Query(PING_INTERVAL),
    db: Session = Depends(get_db),
):
    """WebSocket endpoint pushing real-time notifications to a user."""

    user: User | None = None
    if not token:
        token = websocket.cookies.get("access_token")
    if not token:
        logger.warning("Rejecting notifications WebSocket: missing token")
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email:
            user = get_user_by_email(db, email)
    except JWTError:
        logger.warning("Rejecting notifications WebSocket: invalid token")
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")

    if not user:
        logger.warning("Rejecting notifications WebSocket: user not found")
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")

    await notifications_manager.connect(user.id, websocket)
    reconnect_delay = min(2**attempt, 30)
    websocket.ping_interval = max(heartbeat, PING_INTERVAL)
    try:
        await websocket.send_json({"v": 1, "type": "reconnect_hint", "delay": reconnect_delay})
    except Exception:
        notifications_manager.disconnect(user.id, websocket)
        return

    async def ping_loop() -> None:
        while True:
            await asyncio.sleep(websocket.ping_interval)
            try:
                await websocket.send_json({"v": 1, "type": "ping"})
            except Exception:  # pragma: no cover
                break
            await asyncio.sleep(PONG_TIMEOUT)
            if time.time() - websocket.last_pong > PONG_TIMEOUT:
                logger.info(
                    "Closing stale notifications WebSocket for user %s", user.id
                )
                try:
                    await websocket.send_json({"v": 1, "type": "reconnect", "delay": reconnect_delay})
                except Exception:
                    pass
                await websocket.close(
                    code=ws_status.WS_1011_INTERNAL_ERROR,
                    reason="heartbeat timeout",
                )
                notifications_manager.disconnect(user.id, websocket)
                break

    ping_task = asyncio.create_task(ping_loop())

    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                continue
            msg_type = data.get("type")
            if msg_type == "pong":
                websocket.last_pong = time.time()
            elif msg_type == "heartbeat":
                interval = data.get("interval")
                if isinstance(interval, (int, float)) and interval >= PING_INTERVAL:
                    websocket.ping_interval = float(interval)
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        notifications_manager.disconnect(user.id, websocket)
