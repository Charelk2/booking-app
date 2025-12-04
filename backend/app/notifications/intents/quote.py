from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.core.config import settings
from app.models import NotificationType, User
from app.utils.email import send_template_email
from app.utils.notifications import (
    _create_and_broadcast,
    _send_sms,
    format_notification_message,
)

logger = logging.getLogger(__name__)


@dataclass
class QuoteContext:
    client: User
    artist: User
    booking_request: models.BookingRequest
    quote: models.QuoteV2


def _build_quote_context(
    db: Session,
    client: User,
    artist: User,
    booking_request: models.BookingRequest,
    quote: models.QuoteV2,
) -> QuoteContext:
    """Simple wrapper for future shared quote context if needed."""
    return QuoteContext(
        client=client,
        artist=artist,
        booking_request=booking_request,
        quote=quote,
    )


def send_quote_accepted_notification(
    db: Session,
    user: User,
    quote_id: int,
    booking_request_id: int,
) -> None:
    """Notify a user that a quote was accepted (in‑app + SMS)."""
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


def send_new_quote_email_to_client(
    db: Session,
    client: User,
    artist: User,
    booking_request: models.BookingRequest,
    quote: models.QuoteV2,
) -> None:
    """Best-effort Mailjet email to a client when a new quote is sent."""
    ctx = _build_quote_context(db, client, artist, booking_request, quote)
    try:
        template_id = getattr(settings, "MAILJET_TEMPLATE_NEW_QUOTE_CLIENT", 0) or 0
        if not (template_id and ctx.client.email):
            return

        client_name = f"{ctx.client.first_name} {ctx.client.last_name}".strip() or "Client"

        provider_name: Optional[str] = None
        try:
            profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == ctx.artist.id)
                .first()
            )
            if profile and profile.business_name:
                provider_name = profile.business_name
        except Exception:
            provider_name = None
        if not provider_name:
            provider_name = f"{ctx.artist.first_name} {ctx.artist.last_name}".strip()

        event_date: Optional[str] = None
        event_time: Optional[str] = None
        try:
            dt = getattr(ctx.booking_request, "proposed_datetime_1", None)
            if dt is not None:
                event_date = dt.date().isoformat()
                event_time = dt.strftime("%H:%M")
        except Exception:
            event_date = None
            event_time = None

        service_name: Optional[str] = None
        currency: Optional[str] = None
        try:
            svc = getattr(ctx.booking_request, "service", None)
            if svc is not None:
                title = getattr(svc, "title", None)
                if title:
                    service_name = title
                currency = getattr(svc, "currency", None)
        except Exception:
            service_name = service_name or None
            currency = currency or None

        quote_total: Optional[str] = None
        try:
            total = getattr(ctx.quote, "total", None)
            if total is not None:
                cur = currency or getattr(settings, "DEFAULT_CURRENCY", "ZAR") or "ZAR"
                quote_total = f"{cur} {total}"
        except Exception:
            quote_total = None

        quote_expires_at: Optional[str] = None
        try:
            expires = getattr(ctx.quote, "expires_at", None)
            if isinstance(expires, datetime):
                quote_expires_at = expires.isoformat()
        except Exception:
            quote_expires_at = None

        event_location: Optional[str] = None
        try:
            tb = getattr(ctx.booking_request, "travel_breakdown", None) or {}
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
            f"{frontend_base}/booking-requests/{ctx.booking_request.id}"
            if frontend_base
            else f"/booking-requests/{ctx.booking_request.id}"
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
            recipient=ctx.client.email,
            template_id=int(template_id),
            variables=clean_vars,
            subject=email_subject,
        )
    except Exception as exc:
        logger.warning(
            "Failed to send quote email for quote %s to %s: %s",
            getattr(quote, "id", None),
            getattr(client, "email", None),
            exc,
        )


def send_quote_expiring_notification(
    db: Session,
    user: Optional[User],
    quote_id: int,
    expires_at: datetime,
    booking_request_id: int,
) -> None:
    """Notify a user that a quote will expire soon (in‑app + SMS)."""
    if user is None:
        logger.error(
            "Failed to send quote expiring notification: user missing for quote %s",
            quote_id,
        )
        return
    from app.crud import crud_notification

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


def send_quote_expired_notification(
    db: Session,
    user: Optional[User],
    quote_id: int,
    booking_request_id: int,
) -> None:
    """Notify a user that a quote expired (in‑app + SMS)."""
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


def send_quote_requested_notification(
    db: Session,
    user: User,
    booking_request_id: int,
) -> None:
    """Notify a provider that a client requested a new quote (in‑app + SMS)."""
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

