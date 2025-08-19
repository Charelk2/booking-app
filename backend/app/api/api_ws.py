from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
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
        if publish and redis:
            await redis.publish(f"ws:{request_id}", json.dumps(message))
        for ws in list(self.active_connections.get(request_id, [])):
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=SEND_TIMEOUT)
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
            await self.broadcast(request_id, {"type": "typing", "users": users})

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
            await self.broadcast(request_id, {"type": "presence", "updates": updates})


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
        for ws in list(self.active_connections.get(user_id, [])):
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=SEND_TIMEOUT)
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
        await websocket.send_json({"type": "reconnect_hint", "delay": reconnect_delay})
    except Exception:
        manager.disconnect(request_id, websocket)
        return

    async def ping_loop() -> None:
        while True:
            await asyncio.sleep(websocket.ping_interval)
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:  # pragma: no cover - connection closed
                break
            await asyncio.sleep(PONG_TIMEOUT)
            if time.time() - websocket.last_pong > PONG_TIMEOUT:
                logger.info(
                    "Closing stale WebSocket for request %s due to heartbeat timeout",
                    request_id,
                )
                try:
                    await websocket.send_json(
                        {"type": "reconnect", "delay": reconnect_delay}
                    )
                except Exception:
                    pass
                await websocket.close(
                    code=ws_status.WS_1011_INTERNAL_ERROR,
                    reason="heartbeat timeout",
                )
                manager.disconnect(request_id, websocket)
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
            elif msg_type == "typing":
                user_id = data.get("user_id")
                if isinstance(user_id, int):
                    await manager.add_typing(request_id, user_id)
            elif msg_type == "presence":
                # Accept both single update {user_id, status} and
                # batched updates {updates: {<user_id>: <status>, ...}}
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
            elif msg_type == "heartbeat":
                interval = data.get("interval")
                if isinstance(interval, (int, float)) and interval >= PING_INTERVAL:
                    websocket.ping_interval = float(interval)
            else:
                await manager.broadcast(request_id, data)
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        manager.disconnect(request_id, websocket)


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
    await websocket.send_json({"type": "reconnect_hint", "delay": reconnect_delay})

    async def ping_loop() -> None:
        while True:
            await asyncio.sleep(websocket.ping_interval)
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:  # pragma: no cover
                break
            await asyncio.sleep(PONG_TIMEOUT)
            if time.time() - websocket.last_pong > PONG_TIMEOUT:
                logger.info(
                    "Closing stale notifications WebSocket for user %s", user.id
                )
                try:
                    await websocket.send_json(
                        {"type": "reconnect", "delay": reconnect_delay}
                    )
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
