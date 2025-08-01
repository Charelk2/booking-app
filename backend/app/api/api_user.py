import logging
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, status, UploadFile, File
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
from ..utils import error_response

router = APIRouter(tags=["users"])
logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
PROFILE_PICS_DIR = STATIC_DIR / "profile_pics"
PROFILE_PICS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_PROFILE_PIC_TYPES = ["image/jpeg", "image/png", "image/webp"]


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
        .filter(
            (Booking.client_id == current_user.id)
            | (Booking.artist_id == current_user.id)
        )
        .all()
    )

    booking_data = []
    for b in bookings:
        simple = (
            db.query(BookingSimple).filter(BookingSimple.quote_id == b.quote_id).first()
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


@router.post(
    "/users/me/profile-picture",
    response_model=UserResponse,
    summary="Upload or update current user's profile picture",
    description="Uploads a new profile picture for the currently authenticated user, replacing any existing one.",
)
async def upload_profile_picture_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
) -> Any:
    """POST /api/v1/users/me/profile-picture"""

    if file.content_type not in ALLOWED_PROFILE_PIC_TYPES:
        raise error_response(
            f"Invalid image type. Allowed: {ALLOWED_PROFILE_PIC_TYPES}",
            {"file": "invalid_type"},
            status.HTTP_400_BAD_REQUEST,
        )

    try:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original = Path(file.filename or "profile").name
        sanitized = re.sub(r"[^a-zA-Z0-9_.-]", "_", original)
        unique_filename = f"{timestamp}_{current_user.id}_{sanitized}"

        file_path = PROFILE_PICS_DIR / unique_filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if current_user.profile_picture_url:
            old_rel = current_user.profile_picture_url.replace("/static/", "", 1)
            old_file = STATIC_DIR / old_rel
            if old_file.exists() and old_file != file_path:
                try:
                    old_file.unlink()
                except OSError as e:
                    logger.warning(
                        "Error deleting old profile picture %s: %s", old_file, e
                    )

        current_user.profile_picture_url = f"/static/profile_pics/{unique_filename}"
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
        return current_user
    except Exception as e:
        if "file_path" in locals() and file_path.exists():
            try:
                file_path.unlink()
            except OSError as cleanup_err:
                logger.warning(
                    "Error cleaning up profile picture %s: %s", file_path, cleanup_err
                )
        raise error_response(
            f"Could not upload profile picture: {e}",
            {"file": "upload_failed"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    finally:
        await file.close()


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
        raise error_response(
            "Incorrect password",
            {"password": "incorrect"},
            status.HTTP_403_FORBIDDEN,
        )

    email = current_user.email
    db.delete(current_user)
    db.commit()
    try:
        send_email(
            email, "Account deleted", "Your account has been permanently deleted."
        )
    except Exception as exc:  # pragma: no cover - email failure shouldn't block
        logger.error("Failed to send deletion email: %s", exc)
    return None
