from sqlalchemy.orm import Session
from ..models import User, NotificationType
from .. import models
from ..crud import crud_notification
from typing import Optional
import os
import logging
import enum
from twilio.rest import Client

TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM = os.getenv("TWILIO_FROM_NUMBER")

logger = logging.getLogger(__name__)

# Final system message indicating all automated prompts are complete.
VIDEO_FLOW_READY_MESSAGE = (
    "All details collected! The artist has been notified."
)

def format_notification_message(
    ntype: NotificationType, **kwargs: str | int | None
) -> str:
    """Return a human friendly notification message."""
    if ntype == NotificationType.NEW_MESSAGE:
        return f"New message: {kwargs.get('content')}"
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
        return f"Deposit payment due for booking #{kwargs.get('booking_id')}"
    if ntype == NotificationType.REVIEW_REQUEST:
        return f"Please review your booking #{kwargs.get('booking_id')}"
    return str(kwargs.get('content', ''))

def _send_sms(phone: Optional[str], message: str) -> None:
    if not phone or not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_FROM:
        return
    try:
        Client(TWILIO_SID, TWILIO_TOKEN).messages.create(
            body=message, from_=TWILIO_FROM, to=phone
        )
    except Exception as exc:
        logger.warning("SMS failed: %s", exc)

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

    message = format_notification_message(
        NotificationType.NEW_MESSAGE, content=content
    )
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.NEW_MESSAGE,
        message=message,
        link=f"/booking-requests/{booking_request_id}",
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


def notify_deposit_due(db: Session, user: Optional[User], booking_id: int) -> None:
    """Notify a user that a deposit payment is due for a booking."""
    if user is None:
        logger.error(
            "Failed to send deposit due notification: user missing for booking %s",
            booking_id,
        )
        return

    message = format_notification_message(
        NotificationType.DEPOSIT_DUE, booking_id=booking_id
    )
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.DEPOSIT_DUE,
        message=message,
        link=f"/bookings/{booking_id}",
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
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.NEW_BOOKING_REQUEST,
        message=message,
        link=f"/booking-requests/{request_id}",
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
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.BOOKING_STATUS_UPDATED,
        message=message,
        link=f"/booking-requests/{request_id}",
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
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.QUOTE_ACCEPTED,
        message=message,
        link=f"/booking-requests/{booking_request_id}",
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
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.NEW_BOOKING,
        message=message,
        link=f"/bookings/{booking_id}",
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)
