from __future__ import annotations

import enum
import logging
from dataclasses import dataclass
from typing import Optional, Union

from sqlalchemy.orm import Session

from app import models
from app.core.config import settings
from app.models import NotificationType, User
from app.utils.email import send_template_email
from app.utils.notifications import (
    _create_and_broadcast,
    _send_sms,
    _send_whatsapp_template,
    format_notification_message,
)

logger = logging.getLogger(__name__)


@dataclass
class BookingRequestContext:
    provider: User
    booking_request: models.BookingRequest
    client: Optional[User]
    booking_type: Union[str, enum.Enum]
    sender_name: str


def _build_context(
    db: Session,
    provider: User,
    request_id: int,
    sender_name: str,
    booking_type: Union[str, enum.Enum],
) -> Optional[BookingRequestContext]:
    """Load the booking request + client for this notification."""
    br: Optional[models.BookingRequest]
    client: Optional[User] = None
    try:
        br = (
            db.query(models.BookingRequest)
            .filter(models.BookingRequest.id == request_id)
            .first()
        )
    except Exception:
        br = None

    if not br:
        return None

    try:
        client = br.client or db.query(models.User).filter(models.User.id == br.client_id).first()
    except Exception:
        client = None

    return BookingRequestContext(
        provider=provider,
        booking_request=br,
        client=client,
        booking_type=booking_type,
        sender_name=sender_name,
    )


def send_booking_request_notifications(
    db: Session,
    provider: User,
    request_id: int,
    sender_name: str,
    booking_type: Union[str, enum.Enum],
) -> None:
    """Send all notifications for a new booking request to a provider.

    Channels: in‑app notification, SMS, email (Mailjet), and WhatsApp template.
    """
    ctx = _build_context(db, provider, request_id, sender_name, booking_type)
    if ctx is None:
        return

    br = ctx.booking_request
    client = ctx.client
    booking_type = ctx.booking_type

    # Provider display name: prefer profile.business_name, then full name.
    provider_name: Optional[str] = None
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

    # Client display name: prefer first+last, fall back to sender_name / "Client".
    client_name: Optional[str] = None
    if client:
        try:
            client_name = f"{client.first_name} {client.last_name}".strip()
        except Exception:
            client_name = None
    if not client_name:
        client_name = ctx.sender_name or "Client"

    # Event datetime.
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    if getattr(br, "proposed_datetime_1", None):
        try:
            dt = br.proposed_datetime_1
            event_date = dt.date().isoformat()
            event_time = dt.strftime("%H:%M")
        except Exception:
            event_date = None
            event_time = None

    # Service name + rough budget.
    service_name: Optional[str] = None
    budget: Optional[str] = None
    try:
        if br.service_id and br.service:
            svc = br.service
            title = getattr(svc, "title", None)
            if title:
                service_name = title
            price = getattr(svc, "price", None)
            currency = getattr(svc, "currency", None)
            if price is not None:
                budget = f"{currency or 'ZAR'} {price}"
    except Exception:
        service_name = service_name or None
        budget = budget or None
    if not service_name:
        if isinstance(booking_type, enum.Enum):
            service_name = booking_type.value
        else:
            service_name = str(booking_type)

    # Event location + guests + numeric estimate from travel_breakdown/service.
    event_location: Optional[str] = None
    guest_count: Optional[str] = None
    try:
        if isinstance(br.travel_breakdown, dict):
            tb = br.travel_breakdown or {}
            event_location = (
                tb.get("event_city")
                or tb.get("city")
                or tb.get("location")
            )
            raw_guests = tb.get("guests_count")
            if raw_guests is not None:
                guest_count = str(raw_guests)
    except Exception:
        event_location = event_location or None
        guest_count = guest_count or None

    estimate_numeric: Optional[str] = None
    try:
        svc_price = getattr(br.service, "price", None) if br.service is not None else None
        if svc_price is not None:
            estimate_numeric = str(svc_price)
    except Exception:
        estimate_numeric = estimate_numeric or None

    special_requests = (br.message or "") if br else ""
    frontend_base = (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    booking_url = (
        f"{frontend_base}/booking-requests/{br.id}"
        if frontend_base
        else f"/booking-requests/{br.id}"
    )
    header_image_url = f"{frontend_base}/booka_logo.jpg" if frontend_base else None

    # 1) In‑app notification + SMS (same as legacy helper).
    message = format_notification_message(
        NotificationType.NEW_BOOKING_REQUEST,
        request_id=br.id,
        sender_name=ctx.sender_name,
        booking_type=booking_type,
    )
    _create_and_broadcast(
        db,
        provider.id,
        NotificationType.NEW_BOOKING_REQUEST,
        message,
        f"/booking-requests/{br.id}",
        sender_name=ctx.sender_name,
        booking_type=booking_type,
    )
    logger.info("Notify %s: %s", provider.email, message)
    _send_sms(provider.phone_number, message)

    # 2) Email via Mailjet template (best‑effort).
    try:
        template_id = getattr(settings, "MAILJET_TEMPLATE_NEW_BOOKING_PROVIDER", 0) or 0
        if template_id and provider.email:
            variables = {
                "provider_name": provider_name,
                "client_name": client_name,
                "event_date": event_date,
                "event_time": event_time,
                "event_location": event_location,
                "service_name": service_name,
                "budget": budget,
                "special_requests": special_requests,
                "booking_url": booking_url,
            }
            clean_vars = {k: v for k, v in variables.items() if v is not None}
            email_subject = f"New booking request from {client_name}"
            send_template_email(
                recipient=provider.email,
                template_id=int(template_id),
                variables=clean_vars,
                subject=email_subject,
            )
    except Exception as exc:
        logger.warning(
            "Failed to send booking request email for request %s to %s: %s",
            br.id,
            provider.email,
            exc,
        )

    # 3) WhatsApp template notification (best‑effort).
    try:
        # WhatsApp requires every text parameter to have a non‑empty value, so we
        # coerce missing values to sensible defaults instead of sending "".
        def _safe_text(value: Optional[str], default: str) -> str:
            try:
                s = str(value).strip() if value is not None else ""
            except Exception:
                s = ""
            return s or default

        body_params: list[str] = [
            _safe_text(provider_name, "Artist"),
            _safe_text(client_name, "Client"),
            _safe_text(service_name or "Booking request", "Booking request"),
            _safe_text(event_date, "To be confirmed"),
            _safe_text(event_location, "To be confirmed"),
            _safe_text(guest_count, "—"),
            _safe_text(estimate_numeric, "0"),
        ]
        _send_whatsapp_template(
            provider.phone_number,
            template_name="new_booking_request1",
            language_code="en",
            body_params=body_params,
            header_image_url=header_image_url,
            button_url_param=str(br.id),
        )
    except Exception as exc:
        logger.warning(
            "Failed to send WhatsApp booking request for request %s to %s: %s",
            br.id,
            provider.phone_number,
            exc,
        )

