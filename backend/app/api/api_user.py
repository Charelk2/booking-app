import logging
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel, EmailStr
from jose import JWTError, jwt

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
from ..models.session import Session as AuthSession
from ..utils.slug import slugify_name, generate_unique_slug
from ..schemas.user import UserResponse
from ..schemas.booking import BookingResponse
from ..schemas.quote_v2 import BookingSimpleRead
from ..schemas.message import MessageResponse
from .dependencies import get_current_user
from ..utils.auth import verify_password, normalize_email
from ..utils.email import send_email
from ..utils.mailjet_contacts import sync_marketing_opt_in
from ..utils import error_response
from ..services.avatar_service import save_user_avatar_bytes, MAX_AVATAR_BYTES
from .auth import SECRET_KEY, ALGORITHM
from app.core.config import settings

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
        content = await file.read()
        if MAX_AVATAR_BYTES and len(content) > MAX_AVATAR_BYTES:
            raise error_response(
                f"Image too large. Max size is {MAX_AVATAR_BYTES} bytes.",
                {"file": "too_large"},
                status.HTTP_400_BAD_REQUEST,
            )

        save_user_avatar_bytes(db, current_user, content, file.content_type, file.filename)
        db.commit()
        db.refresh(current_user)
        return current_user
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise error_response(
            f"Could not upload profile picture: {e}",
            {"file": "upload_failed"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    finally:
        await file.close()


class UpdateMeRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone_number: str | None = None
    marketing_opt_in: bool | None = None


@router.patch("/users/me", response_model=UserResponse)
def update_me(
    payload: UpdateMeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> Any:
    """Update basic profile fields for the current user."""

    marketing_changed = False

    if payload.first_name is not None:
        first = (payload.first_name or "").strip()
        if not first:
            raise error_response(
                "First name is required",
                {"first_name": "required"},
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        current_user.first_name = first

    if payload.last_name is not None:
        last = (payload.last_name or "").strip()
        if not last:
            raise error_response(
                "Last name is required",
                {"last_name": "required"},
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        current_user.last_name = last

    if payload.phone_number is not None:
        current_user.phone_number = (payload.phone_number or "").strip() or None

    if payload.marketing_opt_in is not None:
        next_opt_in = bool(payload.marketing_opt_in)
        prev_opt_in = bool(getattr(current_user, "marketing_opt_in", False))
        if next_opt_in != prev_opt_in:
            marketing_changed = True
        current_user.marketing_opt_in = next_opt_in

    try:
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
    except Exception as exc:
        db.rollback()
        raise error_response(
            f"Unable to update account: {exc}",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if marketing_changed:
        try:
            background_tasks.add_task(
                sync_marketing_opt_in, current_user.email, bool(current_user.marketing_opt_in)
            )
        except Exception:
            pass

    return current_user


class DeleteMeRequest(BaseModel):
    password: str


@router.delete("/users/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    payload: DeleteMeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
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
        background_tasks.add_task(
            send_email,
            email,
            "Account deleted",
            "Your account has been permanently deleted.",
        )
    except Exception as exc:  # pragma: no cover - email failure shouldn't block
        logger.error("Failed to enqueue deletion email: %s", exc)
    return None


class BecomeProviderRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone_number: str | None = None
    dob: str | None = None  # accepted for future use; not persisted currently


class EmailChangeRequest(BaseModel):
    new_email: EmailStr


@router.post("/users/me/email-change/request")
def request_email_change(
    payload: EmailChangeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    new_email = normalize_email(payload.new_email)
    old_email = normalize_email(current_user.email)
    if new_email == old_email:
        raise error_response(
            "That is already your email address.",
            {"new_email": "same_as_current"},
            status.HTTP_400_BAD_REQUEST,
        )

    # Normalized equality keeps the email index usable.
    existing = db.query(User).filter(User.email == new_email).first()
    if existing:
        raise error_response(
            "That email already has an account. Use a different email.",
            {"new_email": "already_exists"},
            status.HTTP_409_CONFLICT,
        )

    exp = datetime.utcnow() + timedelta(hours=24)
    token = jwt.encode(
        {"sub": old_email, "uid": current_user.id, "new": new_email, "typ": "email_change", "exp": exp},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    confirm_link = f"{settings.FRONTEND_URL}/confirm-email-change?token={token}"

    try:
        background_tasks.add_task(
            send_email,
            new_email,
            "Confirm your new email",
            f"Click the link to confirm your new email address: {confirm_link}",
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to enqueue email change confirmation: %s", exc)

    # In dev mode, surface the link to the client to ease testing.
    if settings.EMAIL_DEV_MODE:
        logger.info("Email change link for user_id=%s: %s", current_user.id, confirm_link)
        return {"message": "Confirmation link generated.", "confirm_link": confirm_link}

    return {"message": "Confirmation link sent to your new email address."}


class EmailChangeConfirmRequest(BaseModel):
    token: str


@router.post("/users/email-change/confirm")
def confirm_email_change(
    payload: EmailChangeConfirmRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Any:
    try:
        data = jwt.decode(payload.token, SECRET_KEY, algorithms=[ALGORITHM])
        if data.get("typ") != "email_change":
            raise error_response("Invalid token type", {}, status.HTTP_400_BAD_REQUEST)
        user_id = int(data.get("uid") or 0)
        new_email = normalize_email(str(data.get("new") or ""))
        old_email = normalize_email(str(data.get("sub") or ""))
    except (JWTError, ValueError):
        raise error_response("Invalid or expired token", {}, status.HTTP_401_UNAUTHORIZED)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise error_response("Invalid or expired token", {}, status.HTTP_401_UNAUTHORIZED)

    # Prevent using stale tokens after subsequent email changes.
    if normalize_email(user.email) != old_email:
        raise error_response("Invalid or expired token", {}, status.HTTP_401_UNAUTHORIZED)

    existing = db.query(User).filter(User.email == new_email, User.id != user.id).first()
    if existing:
        raise error_response(
            "That email already has an account. Use a different email.",
            {"new_email": "already_exists"},
            status.HTTP_409_CONFLICT,
        )

    try:
        user.email = new_email
        user.is_verified = True

        # If the provider profile contact email mirrors the login email, keep it in sync.
        if user.user_type == UserType.SERVICE_PROVIDER:
            prof = (
                db.query(ServiceProviderProfile)
                .filter(ServiceProviderProfile.user_id == user.id)
                .first()
            )
            if prof and (not prof.contact_email or normalize_email(prof.contact_email) == old_email):
                prof.contact_email = new_email
                db.add(prof)

        # Revoke sessions and invalidate refresh tokens.
        try:
            db.query(AuthSession).filter(
                AuthSession.user_id == user.id,
                AuthSession.revoked_at.is_(None),
            ).update({AuthSession.revoked_at: datetime.utcnow()})
        except Exception:
            user.refresh_token_hash = None
            user.refresh_token_expires_at = None

        user.refresh_token_hash = None
        user.refresh_token_expires_at = None

        db.add(user)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise error_response(
            f"Unable to update email: {exc}",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Best-effort: notify old email and sync marketing list.
    try:
        background_tasks.add_task(
            send_email,
            old_email,
            "Your Booka email was changed",
            "Your Booka account email address was changed. If this wasn't you, please contact support immediately.",
        )
    except Exception:
        pass

    try:
        background_tasks.add_task(
            sync_marketing_opt_in,
            old_email,
            False,
        )
        background_tasks.add_task(
            sync_marketing_opt_in,
            new_email,
            bool(getattr(user, "marketing_opt_in", False)),
        )
    except Exception:
        pass

    return {"message": "Email updated. Please sign in again using your new email address."}


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
            # Seed a friendly slug based on the upgraded user's name.
            base_name = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.email
            base_slug = slugify_name(base_name) or f"artist-{current_user.id}"
            existing = [
                s
                for (s,) in db.query(ServiceProviderProfile.slug)
                .filter(ServiceProviderProfile.slug.isnot(None))
                .all()
                if s
            ]
            unique_slug = generate_unique_slug(base_slug, existing)
            prof = ServiceProviderProfile(
                user_id=current_user.id,
                contact_email=current_user.email,
                contact_phone=current_user.phone_number,
                slug=unique_slug,
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
