from sqlalchemy.orm import Session
from ..models import User, NotificationType
from .. import models
from ..crud import crud_notification
from ..schemas.notification import NotificationResponse
from ..api.api_ws import notifications_manager
from typing import Optional
import asyncio
from datetime import datetime
import os
import logging
import enum
from twilio.rest import Client

TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM = os.getenv("TWILIO_FROM_NUMBER")

logger = logging.getLogger(__name__)

# Final system message indicating all automated prompts are complete.
VIDEO_FLOW_READY_MESSAGE = "All details collected! The artist has been notified."


def format_notification_message(
    ntype: NotificationType, **kwargs: str | int | None
) -> str:
    """Return a human friendly notification message."""
    if ntype == NotificationType.NEW_MESSAGE:
        sender = kwargs.get("sender_name")
        content = kwargs.get("content")
        if sender:
            return f"New message from {sender}: {content}"
        return f"New message: {content}"
    if ntype == NotificationType.NEW_BOOKING_REQUEST:
        sender = kwargs.get("sender_name")
        btype = kwargs.get("booking_type")
        if isinstance(btype, enum.Enum):
            btype = btype.value
        if sender and btype:
            return f"New booking request from {sender}: {btype}"
        return f"New booking request #{kwargs.get('request_id')}"
    if ntype == NotificationType.BOOKING_STATUS_UPDATED:
        return (
            f"Booking request #{kwargs.get('request_id')} status updated to"
            f" {kwargs.get('status')}"
        )
    if ntype == NotificationType.QUOTE_ACCEPTED:
        return f"Quote #{kwargs.get('quote_id')} accepted"
    if ntype == NotificationType.NEW_BOOKING:
        return f"New booking #{kwargs.get('booking_id')}"
    if ntype == NotificationType.DEPOSIT_DUE:
        amount = kwargs.get("deposit_amount")
        due_by = kwargs.get("deposit_due_by")
        msg = "Deposit"
        if amount is not None:
            try:
                amt_str = f"R{float(amount):.2f}"
            except Exception:  # pragma: no cover - formatting should not fail
                amt_str = f"R{amount}"
            msg += f" {amt_str}"
        if due_by is not None:
            try:
                date_str = due_by.strftime("%Y-%m-%d")
                msg += f" due by {date_str}"
            except Exception:
                msg += " due"
        else:
            msg += " due"
        return msg
    if ntype == NotificationType.REVIEW_REQUEST:
        return f"Please review your booking #{kwargs.get('booking_id')}"
    return str(kwargs.get("content", ""))


def _send_sms(phone: Optional[str], message: str) -> None:
    if not phone or not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_FROM:
        return
    try:
        Client(TWILIO_SID, TWILIO_TOKEN).messages.create(
            body=message, from_=TWILIO_FROM, to=phone
        )
    except Exception as exc:
        logger.warning("SMS failed: %s", exc)


def _create_and_broadcast(
    db: Session,
    user_id: int,
    ntype: NotificationType,
    message: str,
    link: str,
    **extra: str | int | None,
) -> None:
    """Persist a notification then broadcast it via WebSocket."""
    notif = crud_notification.create_notification(
        db,
        user_id=user_id,
        type=ntype,
        message=message,
        link=link,
    )
    data = NotificationResponse.model_validate(notif).model_dump()
    for k, v in extra.items():
        data[k] = v
    try:
        asyncio.create_task(notifications_manager.broadcast(user_id, data))
    except RuntimeError:
        # If no event loop is running (e.g., in tests), send synchronously
        notifications_manager.broadcast(user_id, data)


BOOKING_DETAILS_PREFIX = "Booking details:"
VIDEO_FLOW_QUESTIONS = [
    "Who is the video for?",
    "What is the occasion?",
    "When should the video be ready?",
    "Any specific instructions or message?",
]


def notify_user_new_message(
    db: Session,
    user: User,
    sender: User,
    booking_request_id: int,
    content: str,
    message_type: "models.MessageType",
) -> None:
    """Create a notification for a new message."""
    if message_type == models.MessageType.SYSTEM:
        if (
            content.startswith(BOOKING_DETAILS_PREFIX)
            or content == VIDEO_FLOW_READY_MESSAGE
            or content in VIDEO_FLOW_QUESTIONS
        ):
            logger.info("Skipping system message notification: %s", content)
            return

    sender_name = f"{sender.first_name} {sender.last_name}"
    if sender.user_type == models.UserType.ARTIST:
        profile = (
            db.query(models.ArtistProfile)
            .filter(models.ArtistProfile.user_id == sender.id)
            .first()
        )
        if profile and profile.business_name:
            sender_name = profile.business_name

    message = format_notification_message(
        NotificationType.NEW_MESSAGE,
        content=content,
        sender_name=sender_name,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.NEW_MESSAGE,
        message,
        f"/booking-requests/{booking_request_id}",
        sender_name=sender_name,
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


def notify_deposit_due(
    db: Session,
    user: Optional[User],
    booking_id: int,
    deposit_amount: Optional[float] = None,
    deposit_due_by: Optional["datetime"] = None,
) -> None:
    """Notify a user that a deposit payment is due for a booking."""
    if user is None:
        logger.error(
            "Failed to send deposit due notification: user missing for booking %s",
            booking_id,
        )
        return

    message = format_notification_message(
        NotificationType.DEPOSIT_DUE,
        booking_id=booking_id,
        deposit_amount=deposit_amount,
        deposit_due_by=deposit_due_by,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.DEPOSIT_DUE,
        message,
        f"/dashboard/client/bookings/{booking_id}?pay=1",
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


def notify_user_new_booking_request(
    db: Session,
    user: User,
    request_id: int,
    sender_name: str,
    booking_type: str | enum.Enum,
) -> None:
    """Create a notification for a new booking request."""
    message = format_notification_message(
        NotificationType.NEW_BOOKING_REQUEST,
        request_id=request_id,
        sender_name=sender_name,
        booking_type=booking_type,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.NEW_BOOKING_REQUEST,
        message,
        f"/booking-requests/{request_id}",
        sender_name=sender_name,
        booking_type=booking_type,
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


def notify_booking_status_update(
    db: Session,
    user: User,
    request_id: int,
    status: str,
) -> None:
    """Create a notification for a booking status change."""
    message = format_notification_message(
        NotificationType.BOOKING_STATUS_UPDATED,
        request_id=request_id,
        status=status,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.BOOKING_STATUS_UPDATED,
        message,
        f"/booking-requests/{request_id}",
        status=status,
        request_id=request_id,
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


def notify_quote_accepted(
    db: Session, user: User, quote_id: int, booking_request_id: int
) -> None:
    """Notify a user that a quote was accepted."""
    message = format_notification_message(
        NotificationType.QUOTE_ACCEPTED,
        quote_id=quote_id,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.QUOTE_ACCEPTED,
        message,
        f"/booking-requests/{booking_request_id}",
        quote_id=quote_id,
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


def notify_new_booking(db: Session, user: Optional[User], booking_id: int) -> None:
    """Notify a user of a new booking.

    If ``user`` is ``None`` the function logs an error and returns gracefully
    without raising an exception. This prevents runtime errors when a booking
    references a missing or deleted user record.
    """
    if user is None:
        logger.error(
            "Failed to send booking notification: user missing for booking %s",
            booking_id,
        )
        return

    message = format_notification_message(
        NotificationType.NEW_BOOKING,
        booking_id=booking_id,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.NEW_BOOKING,
        message,
        f"/dashboard/client/bookings/{booking_id}",
        booking_id=booking_id,
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


def notify_review_request(db: Session, user: Optional[User], booking_id: int) -> None:
    """Notify a user to review a completed booking."""
    if user is None:
        logger.error(
            "Failed to send review request notification: user missing for booking %s",
            booking_id,
        )
        return

    message = format_notification_message(
        NotificationType.REVIEW_REQUEST,
        booking_id=booking_id,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.REVIEW_REQUEST,
        message,
        f"/dashboard/client/bookings/{booking_id}?review=1",
        booking_id=booking_id,
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)
