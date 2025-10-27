from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, Request
from fastapi.encoders import jsonable_encoder
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette import status as ws_status
from starlette.exceptions import WebSocketException

import asyncio
import json
import logging
import os
from urllib.parse import urlparse
import time
from typing import Any, Dict, List, Set, Tuple
from weakref import WeakKeyDictionary

# Custom WebSocket close codes mirroring HTTP status codes
WS_4401_UNAUTHORIZED = 4401

try:  # Optional Redis support
    from redis import asyncio as aioredis
except Exception:  # pragma: no cover - redis is optional
    aioredis = None

from .dependencies import get_db
from .. import crud
from ..models.user import User
from .auth import ALGORITHM, SECRET_KEY, get_user_by_email
from ..database import SessionLocal
from ..utils.metrics import incr as metrics_incr, timing_ms as metrics_timing

logger = logging.getLogger(__name__)

router = APIRouter()


REDIS_URL_RAW = os.getenv("WEBSOCKET_REDIS_URL", "").strip()

def _normalize_ws_redis_url(raw: str) -> tuple[str | None, bool]:
    """Normalize and validate WEBSOCKET_REDIS_URL.

    Returns (url_or_none, enabled_flag). Treat common "disabled" sentinels and
    empty values as disabled. Accept only redis://, rediss://, or unix:// schemes.
    Translate redis+tls:// to rediss:// for convenience.
    """
    if not raw:
        return (None, False)
    low = raw.lower().strip()
    if low in {"none", "disabled", "false", "0"}:
        return (None, False)
    # Support redis+tls:// style by mapping to rediss://
    if low.startswith("redis+tls://"):
        return ("rediss://" + raw.split("://", 1)[1], True)
    if low.startswith("redis://") or low.startswith("rediss://") or low.startswith("unix://"):
        # On Fly (production), never allow localhost/127.* Redis URLs — treat as disabled
        try:
            u = urlparse(raw)
            host = (u.hostname or "").lower()
            if os.getenv("FLY_APP_NAME") and host in {"localhost", "127.0.0.1"}:
                logger.warning("Disabling WS Redis: localhost URL in production: %s", raw)
                return (None, False)
        except Exception:
            pass
        return (raw, True)
    # Any other scheme is considered invalid -> disabled
    logger.warning("Ignoring invalid WEBSOCKET_REDIS_URL scheme: %s", raw)
    return (None, False)

REDIS_URL, _REDIS_ENABLED = _normalize_ws_redis_url(REDIS_URL_RAW)

# Keep one Redis client per running loop to avoid cross-loop issues when code
# runs under different event loops (e.g., tests using asyncio.run()).
_loop_redis: "WeakKeyDictionary[asyncio.AbstractEventLoop, Any]" = WeakKeyDictionary()

# Short-TTL in-memory cache used only during WS handshakes to reduce DB pressure
# on reconnect bursts. Maps email -> (user_id, expires_at_ms)
_USER_ID_CACHE: Dict[str, Tuple[int, float]] = {}

def _cache_get_user_id(email: str) -> int | None:
    try:
        uid, exp = _USER_ID_CACHE.get(email, (None, 0))  # type: ignore[assignment]
        if uid is None:
            return None
        now_ms = time.time() * 1000.0
        if exp <= now_ms:
            try:
                del _USER_ID_CACHE[email]
            except Exception:
                pass
            return None
        return int(uid)
    except Exception:
        return None

def _cache_set_user_id(email: str, user_id: int, ttl_ms: int = 5000) -> None:
    try:
        _USER_ID_CACHE[email] = (int(user_id), (time.time() * 1000.0) + ttl_ms)
    except Exception:
        pass


# ————————————————————————————————————————————————————————————————
# Presence registry (authoritative per-process; optional Redis mirroring)
# We intentionally keep this minimal: a simple connection counter per user
# and a current status. This powers subscribe-time presence snapshots so late
# subscribers get a consistent view.
_presence_counts: Dict[int, int] = {}
_presence_status: Dict[int, str] = {}

def _presence_is_online(user_id: int) -> bool:
    try:
        return int(_presence_counts.get(int(user_id), 0)) > 0 or (_presence_status.get(int(user_id)) == "online")
    except Exception:
        return False

def _presence_mark_online(user_id: int) -> None:
    try:
        uid = int(user_id)
        _presence_counts[uid] = int(_presence_counts.get(uid, 0)) + 1
        _presence_status[uid] = "online"
    except Exception:
        pass

def _presence_mark_offline(user_id: int) -> None:
    try:
        uid = int(user_id)
        cnt = int(_presence_counts.get(uid, 0)) - 1
        if cnt <= 0:
            _presence_counts[uid] = 0
            _presence_status[uid] = "offline"
        else:
            _presence_counts[uid] = cnt
    except Exception:
        pass


def _get_redis() -> Any | None:
    if not aioredis or not _REDIS_ENABLED or not REDIS_URL:
        return None
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return None
    client = _loop_redis.get(loop)
    if client is None:
        try:
            client = aioredis.from_url(
                REDIS_URL,
                health_check_interval=30,
                retry_on_timeout=True,
                socket_keepalive=True,
                socket_timeout=5,
                socket_connect_timeout=2,
            )
        except Exception as exc:
            # Treat bad URLs or connection errors as disabled to avoid noisy 500s
            logger.warning("WS Redis client creation failed; disabling Redis: %s", exc)
            return None
        _loop_redis[loop] = client
    return client


async def _safe_publish(channel: str, payload: str) -> None:
    """Publish to Redis with auto-retry on a fresh client if the connection is closed.

    Avoids bubbling transport errors from background tasks (e.g., Starlette BackgroundTask)
    when the underlying TCP connection has been closed by the event loop or idle timeout.
    """
    client = _get_redis()
    if not client:
        return
    try:
        await client.publish(channel, payload)
        return
    except Exception as exc:
        # Attempt a one-time reconnect and retry
        try:
            logger.warning(
                "Redis publish failed on %s (%s); recreating client", channel, exc
            )
            loop = asyncio.get_running_loop()
            try:
                old = _loop_redis.pop(loop, None)
                if old is not None:
                    try:
                        await old.close()
                    except Exception:
                        pass
            except Exception:
                pass
            client = _get_redis()
            if client:
                await client.publish(channel, payload)
        except Exception:
            # Swallow to keep user requests succeeding; clients will still poll and receive updates
            logger.warning("Redis publish retry failed on %s", channel)
            return

PING_INTERVAL = 30
# Must exceed PING_INTERVAL with headroom to avoid premature 1011 closes
PONG_TIMEOUT = 45
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
        client = _get_redis()
        if not client:
            return
        pubsub = client.pubsub()
        channel = f"ws:{request_id}"
        await pubsub.subscribe(channel)
        try:
            # Poll Redis with a short timeout to avoid blocking the event loop
            # and allow cancellation when the room goes empty.
            while True:
                try:
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                except Exception:
                    msg = None
                if not msg:
                    # No message in this tick; yield to loop
                    await asyncio.sleep(0)
                    continue
                if msg.get("type") != "message":
                    continue
                try:
                    data = json.loads(msg.get("data"))
                except Exception:
                    continue
                await self.broadcast(request_id, data, publish=False)
        finally:  # pragma: no cover - network cleanup
            try:
                await pubsub.unsubscribe(channel)
            except Exception:
                pass
            try:
                await pubsub.close()
            except Exception:
                pass

    async def connect(self, request_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        websocket.last_pong = time.time()
        self.active_connections.setdefault(request_id, []).append(websocket)
        if aioredis and _REDIS_ENABLED and request_id not in self.redis_tasks:
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
        start = None
        try:
            start = asyncio.get_running_loop().time()
        except Exception:
            start = None
        payload = jsonable_encoder(message)
        error = False
        if publish:
            try:
                await _safe_publish(f"ws:{request_id}", json.dumps(payload))
            except Exception:
                error = True
        # Fan out to multiplex topic subscribers in this process
        try:
            await multiplex_manager.broadcast_topic(
                f"booking-requests:{request_id}",
                payload,
                publish=publish,
            )
        except Exception:
            error = True
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
                error = True
            except Exception:
                # Client likely disconnected abruptly; drop silently to avoid noisy traces
                try:
                    await ws.close()
                except Exception:
                    pass
                self.disconnect(request_id, ws)
                error = True
        # Metrics (best-effort, non-blocking)
        try:
            metrics_incr("broadcast.count", tags={"topic": "booking_requests"})
            if start is not None:
                dt = (asyncio.get_running_loop().time() - start) * 1000.0
                metrics_timing("broadcast.ms", dt, tags={"topic": "booking_requests"})
            if error:
                metrics_incr("broadcast.error_total", tags={"topic": "booking_requests"})
        except Exception:
            pass

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
        if True:  # use safe publisher (no-op when Redis not configured)
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
                await _safe_publish(
                    f"ws-topic:notifications:{user_id}", json.dumps(publish_payload)
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
        if publish:
            try:
                publish_payload = payload
                if isinstance(publish_payload, dict):
                    publish_payload = {
                        "v": publish_payload.get("v", 1),
                        "type": publish_payload.get("type"),
                        "topic": publish_payload.get("topic", topic),
                        **publish_payload,
                    }
                await _safe_publish(
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
):
    """WebSocket endpoint for booking-specific chat rooms."""

    user: User | None = None
    # Accept cookie-based auth when query token is missing
    if not token:
        token = websocket.cookies.get("access_token")
    if not token:
        # Authorization: Bearer fallback
        try:
            auth = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split(" ", 1)[1].strip()
        except Exception:
            token = None
    if not token:
        logger.warning("Rejecting WebSocket for request %s: missing token", request_id)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"leeway": 60})
        email = payload.get("sub")
        if email:
            _db = SessionLocal()
            try:
                user = get_user_by_email(_db, email)
            finally:
                _db.close()
    except JWTError:
        logger.warning("Rejecting WebSocket for request %s: invalid token", request_id)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")
    if not user:
        logger.warning("Rejecting WebSocket for request %s: user not found", request_id)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")
    _db = SessionLocal()
    try:
        booking_request = crud.crud_booking_request.get_booking_request(
            _db, request_id=request_id
        )
    finally:
        _db.close()
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
    # Emit online presence for this user in this booking room (batched)
    try:
        await manager.add_presence(request_id, int(user.id), "online")
    except Exception:
        pass
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
            try:
                text = await websocket.receive_text()
            except RuntimeError as exc:
                # Starlette may raise this if the socket closed before accept/receive
                # or if the client disconnects during handshake. Treat as clean close.
                if "WebSocket is not connected" in str(exc):
                    break
                raise
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
        # Emit offline presence when the socket closes for this room
        try:
            await manager.add_presence(request_id, int(user.id), "offline")
        except Exception:
            pass
        manager.disconnect(request_id, websocket)


@router.websocket("/ws")
async def multiplex_ws(
    websocket: WebSocket,
    token: str | None = Query(None),
    attempt: int = Query(0),
    heartbeat: int = Query(PING_INTERVAL),
):
    """Single WebSocket connection supporting topic subscribe/unsubscribe."""
    user: User | None = None
    if not token:
        token = websocket.cookies.get("access_token")
    if not token:
        try:
            auth = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split(" ", 1)[1].strip()
        except Exception:
            token = None
    if not token:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"leeway": 60})
        email = payload.get("sub")
        if email:
            cached = _cache_get_user_id(str(email))
            if cached is not None:
                # Create a lightweight user-like object exposing only id
                class _UserLite:
                    def __init__(self, id_: int) -> None:
                        self.id = id_

                user = _UserLite(cached)  # type: ignore[assignment]
            else:
                _db = SessionLocal()
                try:
                    try:
                        rec = get_user_by_email(_db, email)
                    except Exception:
                        # Close gracefully with 1011 instead of bubbling handshake error
                        raise WebSocketException(
                            code=ws_status.WS_1011_INTERNAL_ERROR,
                            reason="db_unavailable",
                        )
                    if rec:
                        user = rec
                        _cache_set_user_id(str(email), int(rec.id))
                finally:
                    _db.close()
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
        # Client disconnected during handshake; do not attempt to send a close frame again.
        return

    # Connection-based presence: mark this user online and fan out to their threads
    try:
        _presence_mark_online(int(user.id))
    except Exception:
        pass
    # Connection-based presence: mark this user online for all of their threads
    user_request_ids: Set[int] = set()
    try:
        _db = SessionLocal()
        try:
            # Limit to a sane number to avoid excessive fanout on very large accounts
            client_reqs = crud.get_booking_requests_by_client(_db, client_id=int(user.id), skip=0, limit=100)
            artist_reqs = crud.get_booking_requests_by_artist(_db, artist_id=int(user.id), skip=0, limit=100)
            for br in client_reqs:
                try:
                    user_request_ids.add(int(br.id))
                except Exception:
                    pass
            for br in artist_reqs:
                try:
                    user_request_ids.add(int(br.id))
                except Exception:
                    pass
        finally:
            _db.close()
        # Best effort presence fanout (batched per room)
        for req_id in list(user_request_ids):
            try:
                await manager.add_presence(req_id, int(user.id), "online")
            except Exception:
                pass
    except Exception:
        user_request_ids = set()

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
            try:
                text = await websocket.receive_text()
            except RuntimeError as exc:
                if "WebSocket is not connected" in str(exc):
                    break
                raise
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
                    _db = SessionLocal()
                    try:
                        br = crud.crud_booking_request.get_booking_request(_db, request_id=req_id)
                    finally:
                        _db.close()
                    if not br or user.id not in [br.client_id, br.artist_id]:
                        continue
                    await multiplex_manager.subscribe(websocket, topic)
                    # Emit a presence snapshot for both participants so late subscribers see current status
                    try:
                        updates = {
                            str(int(br.client_id)): "online" if _presence_is_online(int(br.client_id)) else "offline",
                            str(int(br.artist_id)): "online" if _presence_is_online(int(br.artist_id)) else "offline",
                        }
                        await multiplex_manager.broadcast_topic(
                            topic,
                            {"v": 1, "type": "presence", "updates": updates, "topic": topic},
                            publish=False,
                        )
                    except Exception:
                        pass
                continue
            if t == "unsubscribe":
                topic = str(data.get("topic") or "").strip()
                if not topic:
                    continue
                if topic == "notifications" or topic == f"notifications:{user.id}":
                    await multiplex_manager.unsubscribe(websocket, f"notifications:{user.id}")
                elif topic.startswith("booking-requests:"):
                    await multiplex_manager.unsubscribe(websocket, topic)
                    # Best-effort: mark user offline for this topic on unsubscribe
                    try:
                        req_id = int(topic.split(":", 1)[1])
                    except Exception:
                        req_id = None
                    if isinstance(req_id, int):
                        try:
                            await manager.add_presence(req_id, int(user.id), "offline")
                        except Exception:
                            pass
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
    request: Request,
    token: str | None = Query(None),
    topics: str = Query(""),
):
    """Server-Sent Events endpoint for receive-only fallback.

    Requires Redis for cross-process fanout. Topics are comma-separated and
    include: booking-requests:<id>, notifications
    """
    client = _get_redis()
    if not aioredis or not client:
        from fastapi import Response
        return Response(status_code=503)
    # Fail fast if Redis is not reachable to avoid long hangs/timeouts
    try:
        await asyncio.wait_for(client.ping(), timeout=2)
    except Exception:
        from fastapi import Response
        return Response(status_code=503)

    user: User | None = None
    if not token:
        # Try cookie auth (same-site EventSource with credentials includes cookies)
        try:
            token = request.cookies.get("access_token")
        except Exception:
            token = None
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email = payload.get("sub")
            if email:
                cached_id = _cache_get_user_id(str(email))
                if cached_id is not None:
                    class _UserLite:
                        def __init__(self, id_: int) -> None:
                            self.id = id_
                    user = _UserLite(int(cached_id))  # type: ignore[assignment]
                else:
                    _db = SessionLocal()
                    try:
                        rec = get_user_by_email(_db, email)
                        if rec:
                            user = rec
                            _cache_set_user_id(str(email), int(rec.id))
                    finally:
                        _db.close()
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

    # Connection-based presence for SSE fallback: fan out user's online/offline to their threads
    user_request_ids: Set[int] = set()
    try:
        if user:
            _db = SessionLocal()
            try:
                # Keep connect-time fanout bounded to reduce DB pressure
                client_reqs = crud.get_booking_requests_by_client(_db, client_id=int(user.id), skip=0, limit=100)
                artist_reqs = crud.get_booking_requests_by_artist(_db, artist_id=int(user.id), skip=0, limit=100)
                for br in client_reqs:
                    try: user_request_ids.add(int(br.id))
                    except Exception: pass
                for br in artist_reqs:
                    try: user_request_ids.add(int(br.id))
                    except Exception: pass
            finally:
                _db.close()
    except Exception:
        user_request_ids = set()

    async def event_generator():
        pubsub = client.pubsub()
        try:
            await asyncio.wait_for(pubsub.subscribe(*chan_names), timeout=3)
        except Exception:
            # If subscribe fails quickly (e.g., Redis unreachable), end stream
            return
        try:
            # Mark user online in presence registry and for threads when SSE is established
            if user and user_request_ids:
                try:
                    _presence_mark_online(int(user.id))
                except Exception:
                    pass
                try:
                    for req_id in list(user_request_ids):
                        try: await manager.add_presence(int(req_id), int(user.id), "online")
                        except Exception: pass
                except Exception:
                    pass
            # Initial comment to open the stream quickly across intermediaries
            yield b":ok\n\n"

            last_heartbeat = time.monotonic()
            heartbeat_every = 25.0
            while True:
                msg = None
                try:
                    # Non-blocking poll for messages; ignore subscribe events
                    msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                except Exception:
                    # Brief backoff on timeouts or transient connection issues
                    await asyncio.sleep(0.2)
                if msg and msg.get("type") == "message":
                    chan = msg.get("channel")
                    if isinstance(chan, bytes):
                        chan = chan.decode()
                    raw = msg.get("data")
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

                # Heartbeat to keep long-lived connections healthy across proxies
                now = time.monotonic()
                if (now - last_heartbeat) >= heartbeat_every:
                    try:
                        yield b":heartbeat\n\n"
                    except Exception:
                        # If the client closed, the StreamingResponse will finalize
                        break
                    last_heartbeat = now
        finally:
            # Mark user offline in registry and for threads when SSE closes
            try:
                if user:
                    try: _presence_mark_offline(int(user.id))
                    except Exception: pass
                    if user_request_ids:
                        for req_id in list(user_request_ids):
                            try: await manager.add_presence(int(req_id), int(user.id), "offline")
                            except Exception: pass
            except Exception:
                pass
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
):
    """WebSocket endpoint pushing real-time notifications to a user."""

    user: User | None = None
    if not token:
        token = websocket.cookies.get("access_token")
    if not token:
        try:
            auth = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split(" ", 1)[1].strip()
        except Exception:
            token = None
    if not token:
        logger.warning("Rejecting notifications WebSocket: missing token")
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"leeway": 60})
        email = payload.get("sub")
        if email:
            cached = _cache_get_user_id(str(email))
            if cached is not None:
                class _UserLite:
                    def __init__(self, id_: int) -> None:
                        self.id = id_
                user = _UserLite(int(cached))  # type: ignore[assignment]
            else:
                _db = SessionLocal()
                try:
                    rec = get_user_by_email(_db, email)
                    if rec:
                        user = rec
                        _cache_set_user_id(str(email), int(rec.id))
                finally:
                    _db.close()
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
        # Mark user offline on global disconnect
        try:
            _presence_mark_offline(int(user.id))
        except Exception:
            pass
        # For notifications WS, presence updates are handled by thread sockets.
        notifications_manager.disconnect(user.id, websocket)
