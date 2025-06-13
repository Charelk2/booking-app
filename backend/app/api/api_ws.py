from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from typing import Dict, List, Any
from jose import JWTError, jwt
import logging

from .dependencies import get_db
from ..models.user import User
from ..crud import crud_booking_request
from .auth import SECRET_KEY, ALGORITHM

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


@router.websocket("/ws/booking-requests/{request_id}")
async def booking_request_ws(
    websocket: WebSocket,
    request_id: int,
    token: str | None = Query(None),
    db: Session = Depends(get_db),
):
    user: User | None = None
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email = payload.get("sub")
            if email:
                user = db.query(User).filter(User.email == email).first()
        except JWTError:
            user = None
    booking_request = crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not booking_request:
        logger.warning(
            "Closing WebSocket for request %s: booking request not found", request_id
        )
        await websocket.close()
        return

    if user and user.id not in [booking_request.client_id, booking_request.artist_id]:
        logger.warning(
            "Closing WebSocket for request %s: unauthorized user %s", request_id, user.id
        )
        await websocket.close()
        return

    await manager.connect(request_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(request_id, websocket)
