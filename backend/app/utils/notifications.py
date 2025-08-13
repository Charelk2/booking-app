from sqlalchemy.orm import Session
from ..models import User, NotificationType
from sqlalchemy.orm import Session
from .. import models
from ..models import User, NotificationType
from ..schemas.notification import NotificationResponse
from typing import Optional
import asyncio
from datetime import datetime
import os
import logging
import enum
import re
from twilio.rest import Client
from . import background_worker

TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM = os.getenv("TWILIO_FROM_NUMBER")

logger = logging.getLogger(__name__)

# Final system message indicating all automated prompts are complete.
VIDEO_FLOW_READY_MESSAGE = "All details collected! The artist has been notified."


def alert_scheduler_failure(exc: Exception) -> None:
    """Emit an error log when a background scheduler run fails."""
    logger.exception("Scheduler run failed: %s", exc)


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
    if ntype == NotificationType.QUOTE_EXPIRED:
        return f"Quote #{kwargs.get('quote_id')} expired"
    if ntype == NotificationType.QUOTE_EXPIRING:
        return f"Quote #{kwargs.get('quote_id')} expiring soon"
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


def _resolve_sender_avatar(
    db: Session, user_id: int, client_id: int, artist_id: int
) -> tuple[str | None, str | None]:
    """Return sender name and avatar for the party opposite ``user_id``.

    If the current user is the artist we show client details and vice versa.
    Returning ``None`` for any field means the caller's existing value should
    be retained. Centralizing this logic ensures consistency across notification
    creators and API responses.
    """

    if user_id == artist_id:
        client = db.query(models.User).filter(models.User.id == client_id).first()
        if client:
            return (
                f"{client.first_name} {client.last_name}",
                client.profile_picture_url,
            )
    elif user_id == client_id:
        artist = db.query(models.User).filter(models.User.id == artist_id).first()
        if artist:
            sender = f"{artist.first_name} {artist.last_name}"
            profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == artist.id)
                .first()
            )
            if profile and profile.business_name:
                sender = profile.business_name
            # Prefer the artist's profile picture from their profile, but fall
            # back to the user record's ``profile_picture_url`` when the
            # profile lacks one. This ensures notifications like booking
            # confirmed or deposit due can always display the artist's avatar
            # to clients.
            avatar = None
            if profile and profile.profile_picture_url:
                avatar = profile.profile_picture_url
            elif artist.profile_picture_url:
                avatar = artist.profile_picture_url
            return sender, avatar
    return None, None


def _build_response(db: Session, n: models.Notification) -> NotificationResponse:
    """Augment a ``Notification`` with derived fields for API responses."""

    data = NotificationResponse.model_validate(n).model_dump()
    sender = data.get("sender_name")
    btype = data.get("booking_type")
    avatar_url = data.get("avatar_url")

    if n.type == models.NotificationType.NEW_MESSAGE:
        try:
            match = re.match(r"New message from ([^:]+):", n.message)
            if match and not sender:
                sender = match.group(1).strip()

            br_match = re.search(r"/(?:booking-requests|messages/thread)/(\d+)", n.link)
            if not br_match:
                q_match = re.search(r"/inbox\?requestId=(\d+)", n.link)
                br_match = q_match
            if br_match:
                br_id = int(br_match.group(1))
                br = (
                    db.query(models.BookingRequest)
                    .filter(models.BookingRequest.id == br_id)
                    .first()
                )
                if br:
                    other_id = (
                        br.client_id if br.artist_id == n.user_id else br.artist_id
                    )
                    other = (
                        db.query(models.User).filter(models.User.id == other_id).first()
                    )
                    if other:
                        if not sender:
                            sender = f"{other.first_name} {other.last_name}"
                        if other.user_type == models.UserType.SERVICE_PROVIDER:
                            profile = (
                                db.query(models.ServiceProviderProfile)
                                .filter(models.ServiceProviderProfile.user_id == other.id)
                                .first()
                            )
                            if profile and profile.business_name and not match:
                                sender = profile.business_name
                            if profile and profile.profile_picture_url:
                                avatar_url = profile.profile_picture_url
                        elif other.profile_picture_url:
                            avatar_url = other.profile_picture_url
        except Exception as exc:  # pragma: no cover - defensive parsing
            logger.warning(
                "Failed to parse sender from message '%s': %s",
                n.message,
                exc,
            )
    elif n.type == models.NotificationType.NEW_BOOKING_REQUEST:
        try:
            match = re.search(r"(?:/booking-requests/|/inbox\?requestId=)(\d+)", n.link)
            if not match:
                raise ValueError("invalid link")
            request_id = int(match.group(1))
            br = (
                db.query(models.BookingRequest)
                .filter(models.BookingRequest.id == request_id)
                .first()
            )
            if br:
                tmp_sender, tmp_avatar = _resolve_sender_avatar(
                    db, n.user_id, br.client_id, br.artist_id
                )
                if tmp_sender:
                    sender = tmp_sender
                if tmp_avatar:
                    avatar_url = tmp_avatar
                if br.service_id:
                    service = (
                        db.query(models.Service)
                        .filter(models.Service.id == br.service_id)
                        .first()
                    )
                    if service:
                        btype = service.service_type
                        if isinstance(btype, enum.Enum):
                            btype = btype.value
        except (ValueError, IndexError) as exc:
            logger.warning(
                "Failed to derive booking request details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type in [
        models.NotificationType.DEPOSIT_DUE,
        models.NotificationType.NEW_BOOKING,
    ]:
        try:
            match = re.search(r"/bookings/(\d+)", n.link)
            if match:
                booking_id = int(match.group(1))
                booking = (
                    db.query(models.BookingSimple)
                    .filter(models.BookingSimple.id == booking_id)
                    .first()
                )
                if booking:
                    tmp_sender, tmp_avatar = _resolve_sender_avatar(
                        db, n.user_id, booking.client_id, booking.artist_id
                    )
                    if tmp_sender:
                        sender = tmp_sender
                    if tmp_avatar:
                        avatar_url = tmp_avatar
        except Exception as exc:  # pragma: no cover - defensive parsing
            logger.warning(
                "Failed to derive review request details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type == models.NotificationType.QUOTE_ACCEPTED:
        try:
            match = re.search(r"/booking-requests/(\d+)", n.link)
            if not match:
                match = re.search(r"/inbox\?requestId=(\d+)", n.link)
            if not match:
                match = re.search(r"/inbox\?requestId=(\d+)", n.link)
            if match:
                request_id = int(match.group(1))
                br = (
                    db.query(models.BookingRequest)
                    .filter(models.BookingRequest.id == request_id)
                    .first()
                )
                if br:
                    tmp_sender, tmp_avatar = _resolve_sender_avatar(
                        db, n.user_id, br.client_id, br.artist_id
                    )
                    if tmp_sender:
                        sender = tmp_sender
                    if tmp_avatar:
                        avatar_url = tmp_avatar
        except (ValueError, IndexError) as exc:
            logger.warning(
                "Failed to derive quote accepted details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type == models.NotificationType.QUOTE_EXPIRED:
        try:
            match = re.search(r"/booking-requests/(\d+)", n.link)
            if match:
                request_id = int(match.group(1))
                br = (
                    db.query(models.BookingRequest)
                    .filter(models.BookingRequest.id == request_id)
                    .first()
                )
                if br:
                    tmp_sender, tmp_avatar = _resolve_sender_avatar(
                        db, n.user_id, br.client_id, br.artist_id
                    )
                    if tmp_sender:
                        sender = tmp_sender
                    if tmp_avatar:
                        avatar_url = tmp_avatar
        except (ValueError, IndexError) as exc:
            logger.warning(
                "Failed to derive quote expired details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type == models.NotificationType.QUOTE_EXPIRING:
        try:
            match = re.search(r"/quotes/(\d+)", n.link)
            if match:
                quote_id = int(match.group(1))
                quote = (
                    db.query(models.QuoteV2)
                    .filter(models.QuoteV2.id == quote_id)
                    .first()
                )
                if not quote:
                    quote = (
                        db.query(models.Quote)
                        .filter(models.Quote.id == quote_id)
                        .first()
                    )
                if quote:
                    tmp_sender, tmp_avatar = _resolve_sender_avatar(
                        db, n.user_id, quote.client_id, quote.artist_id
                    )
                    if tmp_sender:
                        sender = tmp_sender
                    if tmp_avatar:
                        avatar_url = tmp_avatar
        except Exception as exc:  # pragma: no cover - defensive parsing
            logger.warning(
                "Failed to derive quote expiring details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type == models.NotificationType.REVIEW_REQUEST:
        try:
            match = re.search(r"/bookings/(\d+)", n.link)
            if match:
                booking_id = int(match.group(1))
                booking = (
                    db.query(models.BookingSimple)
                    .filter(models.BookingSimple.id == booking_id)
                    .first()
                )
                if booking:
                    tmp_sender, tmp_avatar = _resolve_sender_avatar(
                        db, n.user_id, booking.client_id, booking.artist_id
                    )
                    if tmp_sender:
                        sender = tmp_sender
                    if tmp_avatar:
                        avatar_url = tmp_avatar
        except Exception as exc:  # pragma: no cover - defensive parsing
            logger.warning(
                "Failed to derive review request details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type == models.NotificationType.BOOKING_STATUS_UPDATED:
        try:
            request_id = int(n.link.split("/")[-1])
            br = (
                db.query(models.BookingRequest)
                .filter(models.BookingRequest.id == request_id)
                .first()
            )
            if br:
                tmp_sender, tmp_avatar = _resolve_sender_avatar(
                    db, n.user_id, br.client_id, br.artist_id
                )
                if tmp_sender:
                    sender = tmp_sender
                if tmp_avatar:
                    avatar_url = tmp_avatar
        except (ValueError, IndexError) as exc:
            logger.warning(
                "Failed to derive booking status update details from link %s: %s",
                n.link,
                exc,
            )

    data["sender_name"] = sender
    data["booking_type"] = btype
    data["avatar_url"] = avatar_url
    return NotificationResponse(**data)


def _send_sms(phone: Optional[str], message: str) -> None:
    """Send an SMS notification in the background with retries."""

    if not phone or not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_FROM:
        return

    def _task():
        Client(TWILIO_SID, TWILIO_TOKEN).messages.create(
            body=message, from_=TWILIO_FROM, to=phone
        )

    try:
        background_worker.enqueue(_task)
    except Exception as exc:  # pragma: no cover - background scheduling errors
        logger.warning("SMS enqueue failed: %s", exc)


def _create_and_broadcast(
    db: Session,
    user_id: int,
    ntype: NotificationType,
    message: str,
    link: str,
    **extra: str | int | None,
) -> None:
    """Persist a notification then broadcast it via WebSocket."""
    from ..crud import crud_notification

    notif = crud_notification.create_notification(
        db,
        user_id=user_id,
        type=ntype,
        message=message,
        link=link,
    )
    response = _build_response(db, notif)
    data = response.model_dump(mode="json")
    for k, v in extra.items():
        if v is not None and data.get(k) in [None, ""]:
            data[k] = v
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(notifications_manager.broadcast(user_id, data))
    except RuntimeError:
        # If no event loop is running (e.g., in tests), run synchronously
        asyncio.run(notifications_manager.broadcast(user_id, data))


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
    avatar_url = None
    if sender.user_type == models.UserType.SERVICE_PROVIDER:
        profile = (
            db.query(models.ServiceProviderProfile)
            .filter(models.ServiceProviderProfile.user_id == sender.id)
            .first()
        )
        if profile and profile.business_name:
            sender_name = profile.business_name
        if profile and profile.profile_picture_url:
            avatar_url = profile.profile_picture_url

    elif sender.profile_picture_url:
        avatar_url = sender.profile_picture_url

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
        f"/inbox?requestId={booking_request_id}",
        sender_name=sender_name,
        avatar_url=avatar_url,
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

    booking = (
        db.query(models.BookingSimple)
        .filter(models.BookingSimple.id == booking_id)
        .first()
    )
    if booking is None:
        logger.error(
            "Failed to send deposit due notification: booking %s missing",
            booking_id,
        )
        return

    # Resolve the opposite party so the frontend can display the correct
    # avatar and sender name. Clients should see the artist's avatar while
    # artists (if ever notified) would see the client's details.
    sender_name, avatar_url = _resolve_sender_avatar(
        db, user.id, booking.client_id, booking.artist_id
    )

    prefix = ""
    if not booking.deposit_paid:
        from ..crud import crud_notification

        existing = crud_notification.get_notifications_for_user(db, user.id)
        has_prior = any(
            n.type == NotificationType.DEPOSIT_DUE
            and f"/dashboard/client/bookings/{booking_id}" in n.link
            for n in existing
        )
        if not has_prior:
            prefix = "Booking confirmed – "

    message = prefix + format_notification_message(
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
        sender_name=sender_name,
        avatar_url=avatar_url,
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


def notify_quote_expiring(
    db: Session,
    user: Optional[User],
    quote_id: int,
    expires_at: "datetime",
    booking_request_id: int,
) -> None:
    """Notify a user that a quote will expire soon."""
    if user is None:
        logger.error(
            "Failed to send quote expiring notification: user missing for quote %s",
            quote_id,
        )
        return
    from ..crud import crud_notification

    existing = crud_notification.get_notifications_for_user(db, user.id)
    already_sent = any(
        n.type == NotificationType.QUOTE_EXPIRING and f"/quotes/{quote_id}" in n.link
        for n in existing
    )
    if already_sent:
        return

    message = format_notification_message(
        NotificationType.QUOTE_EXPIRING,
        quote_id=quote_id,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.QUOTE_EXPIRING,
        message,
        f"/quotes/{quote_id}",
        quote_id=quote_id,
        expires_at=expires_at,
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


def notify_quote_expired(
    db: Session, user: Optional[User], quote_id: int, booking_request_id: int
) -> None:
    """Notify a user that a quote expired."""
    if user is None:
        logger.error(
            "Failed to send quote expired notification: user missing for quote %s",
            quote_id,
        )
        return

    message = format_notification_message(
        NotificationType.QUOTE_EXPIRED,
        quote_id=quote_id,
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.QUOTE_EXPIRED,
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

    booking = (
        db.query(models.BookingSimple)
        .filter(models.BookingSimple.id == booking_id)
        .first()
    )
    if booking is None:
        logger.error(
            "Failed to send booking notification: booking %s missing",
            booking_id,
        )
        return

    # Determine the opposite party for avatar/sender info.
    sender_name: str | None = None
    avatar_url: str | None = None
    if user.id == booking.client_id:
        artist = (
            db.query(models.User).filter(models.User.id == booking.artist_id).first()
        )
        if artist:
            sender_name = f"{artist.first_name} {artist.last_name}"
            profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == artist.id)
                .first()
            )
            if profile and profile.business_name:
                sender_name = profile.business_name
            if profile and profile.profile_picture_url:
                avatar_url = profile.profile_picture_url
            elif artist.profile_picture_url:
                avatar_url = artist.profile_picture_url
    elif user.id == booking.artist_id:
        client = (
            db.query(models.User).filter(models.User.id == booking.client_id).first()
        )
        if client:
            sender_name = f"{client.first_name} {client.last_name}"
            avatar_url = client.profile_picture_url

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
        sender_name=sender_name,
        avatar_url=avatar_url,
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


try:  # pragma: no cover - module import side effect
    from ..api.api_ws import notifications_manager  # type: ignore
except Exception:  # pragma: no cover - fallback for circular import during tests
    class _DummyManager:
        async def broadcast(self, *args, **kwargs):  # noqa: D401
            """Placeholder broadcast method used during tests."""
            return None

    notifications_manager = _DummyManager()


def _safe_broadcast(payload: dict) -> None:
    """Fire-and-forget broadcast that works with or without a running loop.

    - If a running event loop exists, schedule via ``create_task``.
    - If no loop is running (e.g., during sync test calls), run the coroutine
      to completion in a temporary loop to avoid RuntimeError.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(notifications_manager.broadcast(payload))
    except RuntimeError:
        try:
            asyncio.run(notifications_manager.broadcast(payload))
        except Exception as exc:  # pragma: no cover - best effort only
            logger.warning("broadcast fallback failed: %s", exc)


# ─── Sound supplier outreach helpers ──────────────────────────────────────────
def notify_service_request(service: "models.Service", booking: "models.Booking", expires_at: "datetime | None", lock_url: str) -> None:  # type: ignore[name-defined]
    """Stub for notifying a sound supplier of a new request.

    In production this would email/SMS the supplier. We log to stdout and rely
    on WebSocket notifications if the supplier has a session.
    """
    try:
        supplier_id = service.artist_id
        message = f"New sound request for booking {booking.id}. Respond: {lock_url}"
        _safe_broadcast(
            {
                "type": "service_request",
                "supplier_id": supplier_id,
                "booking_id": booking.id,
                "expires_at": expires_at.isoformat() if expires_at else None,
                "lock_url": lock_url,
                "service_id": service.id,
            }
        )
        logger.info("Notify supplier %s: %s", supplier_id, message)
    except Exception as exc:  # pragma: no cover - best effort only
        logger.warning("notify_service_request failed: %s", exc)


def notify_service_nudge(service: "models.Service", booking: "models.Booking") -> None:  # type: ignore[name-defined]
    """Stub reminder to supplier about pending request."""
    try:
        supplier_id = service.artist_id
        message = f"Reminder: pending sound request for booking {booking.id}"
        _safe_broadcast(
            {
                "type": "service_nudge",
                "supplier_id": supplier_id,
                "booking_id": booking.id,
                "service_id": service.id,
            }
        )
        logger.info("Nudge supplier %s: %s", supplier_id, message)
    except Exception as exc:  # pragma: no cover - best effort only
        logger.warning("notify_service_nudge failed: %s", exc)
