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
from typing import Any

import json
import urllib.request
import urllib.error
try:  # optional dependency
    from twilio.rest import Client  # type: ignore
    _HAS_TWILIO = True
except Exception:  # pragma: no cover - optional for tooling
    Client = None  # type: ignore
    _HAS_TWILIO = False
from . import background_worker
from .email import send_template_email
from ..core.config import settings

TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM = os.getenv("TWILIO_FROM_NUMBER")

WHATSAPP_ENABLED = os.getenv("WHATSAPP_ENABLED", "0").strip().lower() in {"1", "true", "yes", "y"}
WHATSAPP_PHONE_ID = (os.getenv("WHATSAPP_PHONE_ID") or "").strip()
WHATSAPP_TOKEN = (os.getenv("WHATSAPP_TOKEN") or "").strip()

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
    # Deposits removed – no special formatting
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
            # confirmed notifications should display the artist's avatar
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
    elif n.type in [models.NotificationType.NEW_BOOKING]:
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

    if (not phone) or (not TWILIO_SID) or (not TWILIO_TOKEN) or (not TWILIO_FROM) or (not _HAS_TWILIO):
        return

    def _task():
        Client(TWILIO_SID, TWILIO_TOKEN).messages.create(
            body=message, from_=TWILIO_FROM, to=phone
        )

    try:
        background_worker.enqueue(_task)
    except Exception as exc:  # pragma: no cover - background scheduling errors
        logger.warning("SMS enqueue failed: %s", exc)


def _send_whatsapp_text(phone: Optional[str], body: str, *, preview_url: bool = True) -> None:
    """Send a basic WhatsApp text via the Cloud API.

    Best-effort only: logs and returns on failure without raising. Requires:
      - WHATSAPP_ENABLED=1
      - WHATSAPP_PHONE_ID and WHATSAPP_TOKEN set in the environment.
    """
    if not WHATSAPP_ENABLED:
        return
    if not phone or not WHATSAPP_PHONE_ID or not WHATSAPP_TOKEN:
        logger.debug(
            "WhatsApp disabled or misconfigured; skipping send (phone=%r, enabled=%r, phone_id=%r)",
            phone,
            WHATSAPP_ENABLED,
            bool(WHATSAPP_PHONE_ID),
        )
        return

    try:
        # Normalize phone to digits only; Cloud API expects E.164 without spaces.
        to = re.sub(r"[^\d+]", "", str(phone))
        if not to:
            return
    except Exception:
        return

    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {
            "preview_url": bool(preview_url),
            "body": body,
        },
    }

    url = f"https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_ID}/messages"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {WHATSAPP_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    def _task() -> None:
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:  # nosec B310
                try:
                    raw = resp.read()
                    logger.info("WhatsApp send ok status=%s body=%s", resp.status, raw.decode("utf-8", "ignore"))
                except Exception:
                    logger.info("WhatsApp send ok status=%s", resp.status)
        except urllib.error.HTTPError as exc:  # pragma: no cover - best-effort
            try:
                detail = exc.read().decode("utf-8", "ignore")
            except Exception:
                detail = "<unavailable>"
            logger.warning("WhatsApp HTTPError status=%s body=%s", getattr(exc, "code", "?"), detail)
        except Exception as exc:  # pragma: no cover - network errors
            logger.warning("WhatsApp send failed: %s", exc)

    try:
        background_worker.enqueue(_task)
    except Exception as exc:  # pragma: no cover - background scheduling errors
        logger.warning("WhatsApp enqueue failed: %s", exc)


def _send_whatsapp_template(
    phone: Optional[str],
    template_name: str,
    language_code: str,
    body_params: list[str] | tuple[str, ...],
    *,
    header_image_url: Optional[str] = None,
    button_url_param: Optional[str] = None,
) -> None:
    """Send a WhatsApp template message via the Cloud API.

    Best-effort only: logs and returns on failure without raising. This helper
    is intended for approved templates like ``new_booking_request_1`` so we
    can benefit from the 24h+ template window instead of plain-text fallbacks.
    """
    if not WHATSAPP_ENABLED:
        return
    if not phone or not WHATSAPP_PHONE_ID or not WHATSAPP_TOKEN:
        logger.debug(
            "WhatsApp template disabled or misconfigured; skipping send (phone=%r, enabled=%r, phone_id=%r)",
            phone,
            WHATSAPP_ENABLED,
            bool(WHATSAPP_PHONE_ID),
        )
        return

    try:
        to = re.sub(r"[^\d+]", "", str(phone))
        if not to:
            return
    except Exception:
        return

    components: list[dict[str, Any]] = []
    if header_image_url:
        components.append(
            {
                "type": "header",
                "parameters": [
                    {
                        "type": "image",
                        "image": {"link": str(header_image_url)},
                    }
                ],
            }
        )
    if body_params:
        components.append(
            {
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in body_params],
            }
        )
    if button_url_param:
        components.append(
            {
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [
                    {
                        "type": "text",
                        "text": str(button_url_param),
                    }
                ],
            }
        )

    template: dict[str, Any] = {
        "name": template_name,
        "language": {"code": language_code},
    }
    if components:
        template["components"] = components

    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": template,
    }

    url = f"https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_ID}/messages"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {WHATSAPP_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    def _task() -> None:
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:  # nosec B310
                try:
                    raw = resp.read()
                    logger.info(
                        "WhatsApp template send ok status=%s body=%s",
                        resp.status,
                        raw.decode("utf-8", "ignore"),
                    )
                except Exception:
                    logger.info("WhatsApp template send ok status=%s", resp.status)
        except urllib.error.HTTPError as exc:  # pragma: no cover - best-effort
            try:
                detail = exc.read().decode("utf-8", "ignore")
            except Exception:
                detail = "<unavailable>"
            logger.warning(
                "WhatsApp template HTTPError status=%s body=%s",
                getattr(exc, "code", "?"),
                detail,
            )
        except Exception as exc:  # pragma: no cover - network errors
            logger.warning("WhatsApp template send failed: %s", exc)

    try:
        background_worker.enqueue(_task)
    except Exception as exc:  # pragma: no cover - background scheduling errors
        logger.warning("WhatsApp template enqueue failed: %s", exc)


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
    *,
    message_id: int | None = None,
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
    # For Booka moderation posts, route to a stable alias instead of numeric requestId
    low = (content or "").strip().lower()
    link = f"/inbox?requestId={booking_request_id}"
    if low.startswith("listing approved:") or low.startswith("listing rejected:"):
        link = "/inbox?booka=1"
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.NEW_MESSAGE,
        message,
        link,
        sender_name=sender_name,
        avatar_url=avatar_url,
        # Realtime enrichment for clients to build precise, dedupable stubs
        booking_request_id=booking_request_id,
        sender_id=int(sender.id) if getattr(sender, "id", None) else None,
        message_type=(message_type.value if hasattr(message_type, "value") else str(message_type)),
        message_id=int(message_id) if message_id is not None else None,
    )
    logger.info("Notify %s: %s", user.email, message)
    _send_sms(user.phone_number, message)


## Deposits removed — no deposit reminder notifications


def notify_user_new_booking_request(
    db: Session,
    user: User,
    request_id: int,
    sender_name: str,
    booking_type: str | enum.Enum,
) -> None:
    """Facade for booking-request notifications.

    All channel-specific behaviour (email, WhatsApp, SMS, in-app) for this
    intent lives under ``app.notifications.intents.booking_request``.
    """
    from app.notifications.intents import booking_request as booking_request_intent

    booking_request_intent.send_booking_request_notifications(
        db=db,
        provider=user,
        request_id=request_id,
        sender_name=sender_name,
        booking_type=booking_type,
    )


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


def notify_client_new_quote_email(
    db: Session,
    client: User,
    artist: User,
    booking_request: "models.BookingRequest",
    quote: "models.QuoteV2",
) -> None:
    """Best-effort Mailjet email to a client when a new quote is sent.

    Mirrors the structure of ``notify_user_new_booking_request`` so templates
    stay easy to reason about. Uses ``MAILJET_TEMPLATE_NEW_QUOTE_CLIENT`` and
    passes a minimal variable set the template can render.
    """
    try:
        template_id = getattr(settings, "MAILJET_TEMPLATE_NEW_QUOTE_CLIENT", 0) or 0
        if not (template_id and client.email):
            return

        # Client display name
        client_name = f"{client.first_name} {client.last_name}".strip() or "Client"

        # Provider display name: prefer business name from profile when present.
        provider_name: str | None = None
        try:
            profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == artist.id)
                .first()
            )
            if profile and profile.business_name:
                provider_name = profile.business_name
        except Exception:
            provider_name = None
        if not provider_name:
            provider_name = f"{artist.first_name} {artist.last_name}".strip()

        # Event date/time from booking request
        event_date: str | None = None
        event_time: str | None = None
        try:
            dt = getattr(booking_request, "proposed_datetime_1", None)
            if dt is not None:
                event_date = dt.date().isoformat()
                event_time = dt.strftime("%H:%M")
        except Exception:
            event_date = None
            event_time = None

        # Service + currency context
        service_name: str | None = None
        currency: str | None = None
        try:
            svc = getattr(booking_request, "service", None)
            if svc is not None:
                title = getattr(svc, "title", None)
                if title:
                    service_name = title
                currency = getattr(svc, "currency", None)
        except Exception:
            service_name = service_name or None
            currency = currency or None

        # Quote total formatted similarly to budget strings
        quote_total: str | None = None
        try:
            total = getattr(quote, "total", None)
            if total is not None:
                cur = currency or getattr(settings, "DEFAULT_CURRENCY", "ZAR") or "ZAR"
                quote_total = f"{cur} {total}"
        except Exception:
            quote_total = None

        # Quote expiry (optional)
        quote_expires_at: str | None = None
        try:
            expires = getattr(quote, "expires_at", None)
            if expires is not None:
                quote_expires_at = expires.isoformat()
        except Exception:
            quote_expires_at = None

        # Event location, if captured on the booking request travel_breakdown
        event_location: str | None = None
        try:
            tb = getattr(booking_request, "travel_breakdown", None) or {}
            if isinstance(tb, dict):
                event_location = (
                    tb.get("event_city")
                    or tb.get("city")
                    or tb.get("location")
                )
        except Exception:
            event_location = None

        frontend_base = (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
        booking_url = (
            f"{frontend_base}/booking-requests/{booking_request.id}"
            if frontend_base
            else f"/booking-requests/{booking_request.id}"
        )

        variables = {
            "client_name": client_name,
            "provider_name": provider_name,
            "event_date": event_date,
            "event_time": event_time,
            "event_location": event_location,
            "service_name": service_name,
            "quote_total": quote_total,
            "quote_expires_at": quote_expires_at,
            "booking_url": booking_url,
        }
        clean_vars = {k: v for k, v in variables.items() if v is not None}
        email_subject = f"New quote from {provider_name} for your booking"
        send_template_email(
            recipient=client.email,
            template_id=int(template_id),
            variables=clean_vars,
            subject=email_subject,
        )
    except Exception as exc:  # pragma: no cover - email is best-effort
        logger.warning(
            "Failed to send quote email for quote %s to %s: %s",
            getattr(quote, "id", None),
            getattr(client, "email", None),
            exc,
        )


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


def notify_quote_requested(
    db: Session,
    user: User,
    booking_request_id: int,
) -> None:
    """Notify a provider that a client requested a new quote in this thread.

    Uses NEW_MESSAGE type for compatibility with existing clients. The
    notification builder will enrich sender/avatar based on the thread link.
    """
    message = format_notification_message(
        NotificationType.NEW_MESSAGE,
        content="New quote requested",
    )
    _create_and_broadcast(
        db,
        user.id,
        NotificationType.NEW_MESSAGE,
        message,
        f"/booking-requests/{booking_request_id}",
        request_id=booking_request_id,
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


def notify_booking_confirmed_email_for_provider(
    db: Session,
    provider: User,
    client: User,
    booking: "models.BookingSimple",
    booking_request: "models.BookingRequest",
) -> None:
    """Best-effort Mailjet email to provider when a booking is confirmed (payment received)."""
    try:
        template_id = getattr(settings, "MAILJET_TEMPLATE_BOOKING_CONFIRMED_PROVIDER", 0) or 0
        if not (template_id and provider.email):
            return

        # Provider display name: prefer business name when present.
        provider_name: str | None = None
        try:
            profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == provider.id)
                .first()
            )
            if profile and profile.business_name:
                provider_name = profile.business_name
        except Exception:
            provider_name = None
        if not provider_name:
            provider_name = f"{provider.first_name} {provider.last_name}".strip()

        client_name = f"{client.first_name} {client.last_name}".strip() or "Client"

        # Event date/time: prefer BookingSimple.date, fall back to BookingRequest.proposed_datetime_1
        event_date: str | None = None
        event_time: str | None = None
        try:
            dt = getattr(booking, "date", None) or getattr(booking_request, "proposed_datetime_1", None)
            if dt is not None:
                event_date = dt.date().isoformat()
                event_time = dt.strftime("%H:%M")
        except Exception:
            event_date = None
            event_time = None

        # Event location: prefer BookingSimple.location, fall back to travel_breakdown/event_city
        event_location: str | None = None
        try:
            event_location = getattr(booking, "location", None)
            if not event_location:
                tb = getattr(booking_request, "travel_breakdown", None) or {}
                if isinstance(tb, dict):
                    event_location = (
                        tb.get("event_city")
                        or tb.get("city")
                        or tb.get("location")
                    )
        except Exception:
            event_location = event_location or None

        # Service name + currency
        service_name: str | None = None
        currency: str | None = None
        try:
            svc = getattr(booking_request, "service", None)
            if svc is not None:
                title = getattr(svc, "title", None)
                if title:
                    service_name = title
                currency = getattr(svc, "currency", None)
        except Exception:
            service_name = service_name or None
            currency = currency or None

        # Total paid from BookingSimple.charged_total_amount
        total_paid: str | None = None
        try:
            amt = getattr(booking, "charged_total_amount", None)
            if amt is not None:
                cur = currency or getattr(settings, "DEFAULT_CURRENCY", "ZAR") or "ZAR"
                total_paid = f"{cur} {amt}"
        except Exception:
            total_paid = None

        booking_reference = str(getattr(booking, "id", "")) or ""

        frontend_base = (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
        booking_url = (
            f"{frontend_base}/dashboard/client/bookings/{booking.id}"
            if frontend_base
            else f"/dashboard/client/bookings/{booking.id}"
        )

        variables = {
            "provider_name": provider_name,
            "client_name": client_name,
            "event_date": event_date,
            "event_time": event_time,
            "event_location": event_location,
            "service_name": service_name,
            "total_paid": total_paid,
            "booking_reference": booking_reference,
            "booking_url": booking_url,
        }
        clean_vars = {k: v for k, v in variables.items() if v is not None}
        email_subject = f"New booking confirmed from {client_name}"
        send_template_email(
            recipient=provider.email,
            template_id=int(template_id),
            variables=clean_vars,
            subject=email_subject,
        )
    except Exception as exc:  # pragma: no cover - email is best-effort
        logger.warning(
            "Failed to send provider booking-confirmed email for booking %s to %s: %s",
            getattr(booking, "id", None),
            getattr(provider, "email", None),
            exc,
        )


def notify_booking_confirmed_email_for_client(
    db: Session,
    client: User,
    provider: User,
    booking: "models.BookingSimple",
    booking_request: "models.BookingRequest",
) -> None:
    """Best-effort Mailjet email to client when a booking is confirmed (payment received)."""
    try:
        template_id = getattr(settings, "MAILJET_TEMPLATE_BOOKING_CONFIRMED_CLIENT", 0) or 0
        if not (template_id and client.email):
            return

        client_name = f"{client.first_name} {client.last_name}".strip() or "Client"

        # Provider display name: prefer business name when present.
        provider_name: str | None = None
        try:
            profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == provider.id)
                .first()
            )
            if profile and profile.business_name:
                provider_name = profile.business_name
        except Exception:
            provider_name = None
        if not provider_name:
            provider_name = f"{provider.first_name} {provider.last_name}".strip()

        # Event date/time: prefer BookingSimple.date, fall back to BookingRequest.proposed_datetime_1
        event_date: str | None = None
        event_time: str | None = None
        try:
            dt = getattr(booking, "date", None) or getattr(booking_request, "proposed_datetime_1", None)
            if dt is not None:
                event_date = dt.date().isoformat()
                event_time = dt.strftime("%H:%M")
        except Exception:
            event_date = None
            event_time = None

        # Event location: prefer BookingSimple.location, fall back to travel_breakdown/event_city
        event_location: str | None = None
        try:
            event_location = getattr(booking, "location", None)
            if not event_location:
                tb = getattr(booking_request, "travel_breakdown", None) or {}
                if isinstance(tb, dict):
                    event_location = (
                        tb.get("event_city")
                        or tb.get("city")
                        or tb.get("location")
                    )
        except Exception:
            event_location = event_location or None

        # Service name + currency
        service_name: str | None = None
        currency: str | None = None
        try:
            svc = getattr(booking_request, "service", None)
            if svc is not None:
                title = getattr(svc, "title", None)
                if title:
                    service_name = title
                currency = getattr(svc, "currency", None)
        except Exception:
            service_name = service_name or None
            currency = currency or None

        # Total paid from BookingSimple.charged_total_amount
        total_paid: str | None = None
        try:
            amt = getattr(booking, "charged_total_amount", None)
            if amt is not None:
                cur = currency or getattr(settings, "DEFAULT_CURRENCY", "ZAR") or "ZAR"
                total_paid = f"{cur} {amt}"
        except Exception:
            total_paid = None

        booking_reference = str(getattr(booking, "id", "")) or ""

        frontend_base = (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
        booking_url = (
            f"{frontend_base}/dashboard/client/bookings/{booking.id}"
            if frontend_base
            else f"/dashboard/client/bookings/{booking.id}"
        )

        variables = {
            "client_name": client_name,
            "provider_name": provider_name,
            "event_date": event_date,
            "event_time": event_time,
            "event_location": event_location,
            "service_name": service_name,
            "total_paid": total_paid,
            "booking_reference": booking_reference,
            "booking_url": booking_url,
        }
        clean_vars = {k: v for k, v in variables.items() if v is not None}
        email_subject = f"Booking confirmed – {service_name or 'your booking'} on {event_date or ''}"
        send_template_email(
            recipient=client.email,
            template_id=int(template_id),
            variables=clean_vars,
            subject=email_subject,
        )
    except Exception as exc:  # pragma: no cover - email is best-effort
        logger.warning(
            "Failed to send client booking-confirmed email for booking %s to %s: %s",
            getattr(booking, "id", None),
            getattr(client, "email", None),
            exc,
        )


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


def _safe_broadcast_to_user(user_id: int, payload: dict) -> None:
    """Best-effort broadcast of a notification payload to a specific user.

    Works with or without a running event loop. Falls back gracefully on errors.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(notifications_manager.broadcast(int(user_id), payload))
    except RuntimeError:
        try:
            asyncio.run(notifications_manager.broadcast(int(user_id), payload))
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
        _safe_broadcast_to_user(
            supplier_id,
            {
                "type": "service_request",
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
        _safe_broadcast_to_user(
            supplier_id,
            {
                "type": "service_nudge",
                "booking_id": booking.id,
                "service_id": service.id,
            }
        )
        logger.info("Nudge supplier %s: %s", supplier_id, message)
    except Exception as exc:  # pragma: no cover - best effort only
        logger.warning("notify_service_nudge failed: %s", exc)


# ─── Listings moderation notifications ────────────────────────────────────────
def notify_listing_moderation(
    db: Session,
    service: "models.Service",  # type: ignore[name-defined]
    approved: bool,
    reason: str | None = None,
) -> None:
    """Notify a provider that their listing was approved or rejected.

    Uses NEW_MESSAGE type for broad compatibility with existing UI handlers.
    """
    try:
        title = getattr(service, "title", "Your listing")
        if approved:
            msg = f"Your listing '{title}' was approved."
        else:
            extra = f" Reason: {reason}" if reason else ""
            msg = f"Your listing '{title}' was rejected.{extra}"
        _create_and_broadcast(
            db,
            user_id=service.artist_id,
            ntype=NotificationType.NEW_MESSAGE,
            message=msg,
            link="/dashboard/artist?tab=services",
        )
        logger.info("Notify provider %s: %s", service.artist_id, msg)
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("notify_listing_moderation failed: %s", exc)
