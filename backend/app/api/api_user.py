import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel

from ..database import get_db
from ..models import (
    User,
    Booking,
    BookingSimple,
    Message,
    BookingRequest,
)
from ..schemas.user import UserResponse
from ..schemas.booking import BookingResponse
from ..schemas.quote_v2 import BookingSimpleRead
from ..schemas.message import MessageResponse
from .dependencies import get_current_user
from ..utils.auth import verify_password
from ..utils.email import send_email

router = APIRouter(tags=["users"])
logger = logging.getLogger(__name__)


@router.get("/users/me/export")
def export_me(
    *, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> Any:
    """Return all user related data as JSON."""
    bookings = (
        db.query(Booking)
        .outerjoin(BookingSimple, Booking.quote_id == BookingSimple.quote_id)
        .options(
            selectinload(Booking.service),
            selectinload(Booking.client),
            selectinload(Booking.source_quote),
        )
        .filter((Booking.client_id == current_user.id) | (Booking.artist_id == current_user.id))
        .all()
    )

    booking_data = []
    for b in bookings:
        simple = (
            db.query(BookingSimple)
            .filter(BookingSimple.quote_id == b.quote_id)
            .first()
        )
        data = BookingResponse.model_validate(b).model_dump()
        if simple:
            simple_data = BookingSimpleRead.model_validate(simple).model_dump()
            data.update(simple_data)
        booking_data.append(data)

    messages = (
        db.query(Message)
        .join(BookingRequest, Message.booking_request_id == BookingRequest.id)
        .filter(
            (BookingRequest.client_id == current_user.id)
            | (BookingRequest.artist_id == current_user.id)
        )
        .order_by(Message.timestamp)
        .all()
    )
    message_data = [MessageResponse.model_validate(m).model_dump() for m in messages]

    payments = (
        db.query(BookingSimple)
        .filter(
            (BookingSimple.client_id == current_user.id)
            | (BookingSimple.artist_id == current_user.id)
        )
        .all()
    )
    payment_data = [BookingSimpleRead.model_validate(p).model_dump() for p in payments]

    return {
        "user": UserResponse.model_validate(current_user).model_dump(),
        "bookings": booking_data,
        "payments": payment_data,
        "messages": message_data,
    }


class DeleteMeRequest(BaseModel):
    password: str


@router.delete("/users/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    payload: DeleteMeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete the current user's account after password confirmation."""
    if not verify_password(payload.password, current_user.password):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect password")

    email = current_user.email
    db.delete(current_user)
    db.commit()
    try:
        send_email(email, "Account deleted", "Your account has been permanently deleted.")
    except Exception as exc:  # pragma: no cover - email failure shouldn't block
        logger.error("Failed to send deletion email: %s", exc)
    return None

