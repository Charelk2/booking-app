from fastapi import (
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
    Depends,
    Query,
)
from starlette.exceptions import WebSocketException
from starlette import status as ws_status

# Custom WebSocket close codes mirroring HTTP status codes
WS_4401_UNAUTHORIZED = 4401
from sqlalchemy.orm import Session
from typing import Dict, List, Any
from jose import JWTError, jwt
import logging

from .dependencies import get_db
from ..models.user import User
from ..crud import crud_booking_request
from .auth import SECRET_KEY, ALGORITHM, get_user_by_email

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, request_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.setdefault(request_id, []).append(websocket)

    def disconnect(self, request_id: int, websocket: WebSocket) -> None:
        conns = self.active_connections.get(request_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                del self.active_connections[request_id]

    async def broadcast(self, request_id: int, message: Any) -> None:
        for ws in self.active_connections.get(request_id, []):
            await ws.send_json(message)


manager = ConnectionManager()


class NotificationManager:
    """Track WebSocket connections per user for real-time notifications."""

    def __init__(self) -> None:
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        conns = self.active_connections.get(user_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                del self.active_connections[user_id]

    async def broadcast(self, user_id: int, message: Any) -> None:
        for ws in self.active_connections.get(user_id, []):
            await ws.send_json(message)


notifications_manager = NotificationManager()


@router.websocket("/ws/booking-requests/{request_id}")
async def booking_request_ws(
    websocket: WebSocket,
    request_id: int,
    token: str | None = Query(None),
    db: Session = Depends(get_db),
):
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
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(request_id, websocket)


@router.websocket("/ws/notifications")
async def notifications_ws(
    websocket: WebSocket,
    token: str | None = Query(None),
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
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        notifications_manager.disconnect(user.id, websocket)
