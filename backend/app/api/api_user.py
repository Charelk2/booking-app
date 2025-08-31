import logging
import re
import shutil
from datetime import datetime
import base64
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, status, UploadFile, File
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel

from ..database import get_db
from ..models import (
    User,
    UserType,
    Booking,
    BookingSimple,
    Message,
    BookingRequest,
)
from ..models.service_provider_profile import ServiceProviderProfile
from ..schemas.user import UserResponse
from ..schemas.booking import BookingResponse
from ..schemas.quote_v2 import BookingSimpleRead
from ..schemas.message import MessageResponse
from .dependencies import get_current_user
from ..utils.auth import verify_password, normalize_email
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
        # Store as data URL in DB (same pattern as service media_url)
        # This survives redeploys because it's persisted with the user record.
        content = await file.read()
        b64 = base64.b64encode(content).decode("ascii")
        mime = file.content_type or "image/jpeg"
        data_url = f"data:{mime};base64,{b64}"

        # Best-effort cleanup for legacy file-based URLs
        if current_user.profile_picture_url:
            old_rel = current_user.profile_picture_url.replace("/static/", "", 1)
            old_file = STATIC_DIR / old_rel
            if old_file.exists():
                try:
                    old_file.unlink()
                except OSError as e:
                    logger.warning("Error deleting old profile picture %s: %s", old_file, e)

        current_user.profile_picture_url = data_url
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
        return current_user
    except Exception as e:
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


class BecomeProviderRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone_number: str | None = None
    dob: str | None = None  # accepted for future use; not persisted currently


@router.post(
    "/users/me/become-service-provider",
    response_model=UserResponse,
    summary="Upgrade the current client to a service provider",
    description=(
        "Converts the authenticated client account into a service provider, "
        "updates basic contact details, and ensures a service provider profile exists."
    ),
)
def become_service_provider(
    payload: BecomeProviderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if current_user.user_type == UserType.SERVICE_PROVIDER:
        # Already a provider; return current state
        return current_user

    # Update user details
    try:
        current_user.first_name = (payload.first_name or current_user.first_name).strip()
        current_user.last_name = (payload.last_name or current_user.last_name).strip()
        if payload.email:
            current_user.email = normalize_email(payload.email)
        if payload.phone_number is not None:
            current_user.phone_number = payload.phone_number.strip() or None
        current_user.user_type = UserType.SERVICE_PROVIDER
        current_user.is_verified = True  # providers are treated as verified

        # Ensure a service provider profile exists
        prof = (
            db.query(ServiceProviderProfile)
            .filter(ServiceProviderProfile.user_id == current_user.id)
            .first()
        )
        if not prof:
            prof = ServiceProviderProfile(
                user_id=current_user.id,
                contact_email=current_user.email,
                contact_phone=current_user.phone_number,
                onboarding_completed=False,
            )
            db.add(prof)

        db.add(current_user)
        db.commit()
        db.refresh(current_user)
    except Exception as exc:
        db.rollback()
        raise error_response(
            f"Unable to upgrade account: {exc}", {}, status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return current_user
