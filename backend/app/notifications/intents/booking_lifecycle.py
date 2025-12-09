from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

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
class BookingLifecycleContext:
    booking_simple: models.BookingSimple
    booking_request: Optional[models.BookingRequest]


def send_booking_status_update_notification(
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


def send_new_booking_notification(
    db: Session,
    user: Optional[User],
    booking_id: int,
) -> None:
    """Notify a user of a new booking (in‑app + SMS)."""
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

    sender_name: Optional[str] = None
    avatar_url: Optional[str] = None
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


def send_booking_confirmed_email_for_provider(
    db: Session,
    provider: User,
    client: User,
    booking: models.BookingSimple,
    booking_request: models.BookingRequest,
) -> None:
    """Best-effort Mailjet email to provider when a booking is confirmed (payment received)."""
    try:
        template_id = getattr(settings, "MAILJET_TEMPLATE_BOOKING_CONFIRMED_PROVIDER", 0) or 0
        if not (template_id and provider.email):
            return

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

        client_name = f"{client.first_name} {client.last_name}".strip() or "Client"

        event_date: Optional[str] = None
        event_time: Optional[str] = None
        try:
            dt = getattr(booking, "date", None) or getattr(booking_request, "proposed_datetime_1", None)
            if dt is not None:
                event_date = dt.date().isoformat()
                event_time = dt.strftime("%H:%M")
        except Exception:
            event_date = None
            event_time = None

        event_location: Optional[str] = None
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

        service_name: Optional[str] = None
        currency: Optional[str] = None
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

        total_paid: Optional[str] = None
        total_paid_numeric: Optional[str] = None
        try:
            amt = getattr(booking, "charged_total_amount", None)
            if amt is not None:
                cur = currency or getattr(settings, "DEFAULT_CURRENCY", "ZAR") or "ZAR"
                total_paid = f"{cur} {amt}"
                total_paid_numeric = str(amt)
        except Exception:
            total_paid = None
            total_paid_numeric = None

        booking_reference = str(getattr(booking, "id", "")) or ""

        frontend_base = (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
        booking_url = (
            f"{frontend_base}/inbox?requestId={booking_request.id}"
            if frontend_base
            else f"/inbox?requestId={booking_request.id}"
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

        # 2) WhatsApp template notification to provider (best-effort).
        try:
            header_image_url = (
                f"{frontend_base}/booka_logo.jpg" if frontend_base else None
            )

            # WhatsApp requires non-empty text parameters.
            def _safe_text(value: Optional[str], default: str) -> str:
                try:
                    s = str(value).strip() if value is not None else ""
                except Exception:
                    s = ""
                return s or default

            body_params: list[str] = [
                _safe_text(provider_name, "Artist"),               # {{1}}
                _safe_text(client_name, "Client"),                 # {{2}}
                _safe_text(event_date, "To be confirmed"),         # {{3}}
                _safe_text(event_location, "To be confirmed"),     # {{4}}
                _safe_text(total_paid_numeric, "0"),               # {{5}}
                _safe_text(booking_reference, "—"),                # {{6}}
            ]

            _send_whatsapp_template(
                provider.phone_number,
                template_name="booka_payment_received_service_provider",
                language_code="en",
                body_params=body_params,
                header_image_url=header_image_url,
                # Template URL uses /dashboard/events/{{1}}; pass booking.id.
                button_url_param=str(booking.id),
            )
        except Exception as exc:
            logger.warning(
                "Failed to send provider payment-received WhatsApp for booking %s to %s: %s",
                getattr(booking, "id", None),
                getattr(provider, "phone_number", None),
                exc,
            )
    except Exception as exc:
        logger.warning(
            "Failed to send provider booking-confirmed email for booking %s to %s: %s",
            getattr(booking, "id", None),
            getattr(provider, "email", None),
            exc,
        )


def send_booking_confirmed_email_for_client(
    db: Session,
    client: User,
    provider: User,
    booking: models.BookingSimple,
    booking_request: models.BookingRequest,
) -> None:
    """Best-effort Mailjet email to client when a booking is confirmed (payment received)."""
    try:
        template_id = getattr(settings, "MAILJET_TEMPLATE_BOOKING_CONFIRMED_CLIENT", 0) or 0
        if not (template_id and client.email):
            return

        client_name = f"{client.first_name} {client.last_name}".strip() or "Client"

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

        event_date: Optional[str] = None
        event_time: Optional[str] = None
        try:
            dt = getattr(booking, "date", None) or getattr(booking_request, "proposed_datetime_1", None)
            if dt is not None:
                event_date = dt.date().isoformat()
                event_time = dt.strftime("%H:%M")
        except Exception:
            event_date = None
            event_time = None

        event_location: Optional[str] = None
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

        service_name: Optional[str] = None
        currency: Optional[str] = None
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

        total_paid: Optional[str] = None
        total_paid_numeric: Optional[str] = None
        try:
            amt = getattr(booking, "charged_total_amount", None)
            if amt is not None:
                cur = currency or getattr(settings, "DEFAULT_CURRENCY", "ZAR") or "ZAR"
                total_paid = f"{cur} {amt}"
                total_paid_numeric = str(amt)
        except Exception:
            total_paid = None
            total_paid_numeric = None

        booking_reference = str(getattr(booking, "id", "")) or ""

        frontend_base = (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
        booking_url = (
            f"{frontend_base}/inbox?requestId={booking_request.id}"
            if frontend_base
            else f"/inbox?requestId={booking_request.id}"
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

        # 2) WhatsApp template notification to client (best-effort).
        try:
            header_image_url = (
                f"{frontend_base}/booka_logo.jpg" if frontend_base else None
            )

            # WhatsApp requires non-empty text parameters.
            def _safe_text(value: Optional[str], default: str) -> str:
                try:
                    s = str(value).strip() if value is not None else ""
                except Exception:
                    s = ""
                return s or default

            body_params: list[str] = [
                _safe_text(client_name, "Client"),                    # {{1}}
                _safe_text(service_name or "Booking", "Booking"),      # {{2}}
                _safe_text(provider_name, "Artist"),                  # {{3}}
                _safe_text(event_date, "To be confirmed"),            # {{4}}
                _safe_text(event_location, "To be confirmed"),        # {{5}}
                _safe_text(total_paid_numeric, "0"),                  # {{6}}
                _safe_text(booking_reference, "—"),                   # {{7}}
            ]

            _send_whatsapp_template(
                client.phone_number,
                template_name="booka_payment_received_customer",
                language_code="en",
                body_params=body_params,
                header_image_url=header_image_url,
                # Template URL uses ?requestId={{1}}; pass booking_request.id.
                button_url_param=str(booking_request.id),
            )
        except Exception as exc:
            logger.warning(
                "Failed to send client payment-received WhatsApp for booking %s to %s: %s",
                getattr(booking, "id", None),
                getattr(client, "phone_number", None),
                exc,
            )
    except Exception as exc:
        logger.warning(
            "Failed to send client booking-confirmed email for booking %s to %s: %s",
            getattr(booking, "id", None),
            getattr(client, "email", None),
            exc,
        )


def send_review_request_notification(
    db: Session,
    user: Optional[User],
    booking_id: int,
) -> None:
    """Notify a user to review a completed booking (in‑app + SMS)."""
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
