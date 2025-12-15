from decimal import Decimal
from datetime import datetime, timedelta
from typing import Optional
import uuid
import os

from sqlalchemy.orm import Session
import logging

from fastapi import status

from .. import models, schemas
from ..models.service import ServiceType
from ..utils.notifications import (
    notify_quote_accepted,
    notify_new_booking,
)
from ..utils import error_response
from ..utils.sound_modes import is_supplier_sound_mode
from .crud_booking import create_booking_from_quote_v2
from . import crud_invoice, crud_message
from ..api.api_sound_outreach import kickoff_sound_outreach
from ..utils.outbox import enqueue_outbox

logger = logging.getLogger(__name__)

def _is_venue_service(service: models.Service) -> bool:
    try:
        cat = getattr(service, "service_category", None)
        name = (getattr(cat, "name", None) or "").strip().lower()
    except Exception:
        name = ""
    return name in ("wedding venue", "venue")


def _status_val(v):
    """Return a comparable string status for QuoteStatusV2 or raw strings.

    Accepts either an Enum member or a plain string from the database; returns
    the lowercase enum value consistently for comparisons.
    """
    return getattr(v, "value", v)


def calculate_totals(
    quote_in: schemas.QuoteV2Create,
    *,
    vat_registered: bool | None = None,
    vat_rate: Decimal | None = None,
) -> tuple[Decimal, Decimal]:
    """Calculate subtotal (pre‑VAT) and total (VAT‑inclusive).

    - Subtotal: sum of service items + sound + travel, before discount and VAT.
    - Discount: applied to the subtotal before VAT.
    - VAT: applied only when the provider is VAT‑registered (default rate from env or profile).
    - Total: (subtotal - discount) + VAT.
    """
    # Read Booka/provider VAT defaults from settings (env-backed), fall back to 15% if unset.
    try:
        from ..core.config import settings
        vat_env = Decimal(str(getattr(settings, "VAT_RATE", None) or "0.15"))
    except Exception:
        vat_env = Decimal("0.15")
    # Normalize provider VAT rate: only apply when explicitly registered.
    vat_rate_to_use = Decimal("0")
    if vat_registered is True:
        if vat_rate is not None and vat_rate > Decimal("0"):
            # Accept stored rate as %, fractional, or decimal
            vat_rate_to_use = vat_rate / Decimal("100") if vat_rate > Decimal("1") else vat_rate
        else:
            vat_rate_to_use = vat_env
    subtotal = sum(item.price for item in quote_in.services)
    subtotal += quote_in.sound_fee + quote_in.travel_fee
    discount = quote_in.discount or Decimal("0")
    pre_vat = subtotal - discount
    if pre_vat < Decimal("0"):
        pre_vat = Decimal("0")
    vat_amount = (pre_vat * vat_rate_to_use)
    total = pre_vat + vat_amount
    return subtotal, total


def create_quote(db: Session, quote_in: schemas.QuoteV2Create) -> models.QuoteV2:
    booking_request = (
        db.query(models.BookingRequest)
        .filter(models.BookingRequest.id == quote_in.booking_request_id)
        .first()
    )
    if booking_request is None:
        raise error_response(
            "Booking request not found",
            {"booking_request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    vat_registered = None
    vat_rate = None
    try:
        prof = (
            db.query(models.ServiceProviderProfile)
            .filter(models.ServiceProviderProfile.user_id == booking_request.artist_id)
            .first()
        )
        if prof is not None:
            flag = getattr(prof, "vat_registered", None)
            vat_registered = True if flag is True else False if flag is False else None
            try:
                raw_rate = getattr(prof, "vat_rate", None)
                if raw_rate is not None:
                    vat_rate = Decimal(str(raw_rate))
            except Exception:
                vat_rate = None
    except Exception:
        vat_registered = None
        vat_rate = None

    # For main artist bookings where sound will be handled by a separate
    # supplier booking (sound_mode == 'supplier'), strip the sound component
    # from this quote so the client does not pay for sound twice. The linked
    # child sound booking will carry its own quote and payment.
    quote_for_calc = quote_in
    try:
        tb = booking_request.travel_breakdown or {}
        sound_mode = (tb.get("sound_mode") if isinstance(tb, dict) else None) or None
        parent_id = getattr(booking_request, "parent_booking_request_id", None)
        is_main_artist_booking = not bool(parent_id)
        if is_main_artist_booking and is_supplier_sound_mode(sound_mode):
            try:
                quote_for_calc = quote_in.copy(update={"sound_fee": Decimal("0")})
            except Exception:
                quote_for_calc = quote_in
    except Exception:
        quote_for_calc = quote_in

    subtotal, total = calculate_totals(quote_for_calc, vat_registered=vat_registered, vat_rate=vat_rate)
    services = [
        {"description": s.description, "price": float(s.price)}
        for s in quote_for_calc.services
    ]
    # Always rely on the booking request for the artist and client IDs. This
    # avoids situations where the payload omits or mislabels these values,
    # ensuring downstream notifications target the correct recipient.
    db_quote = models.QuoteV2(
        booking_request_id=booking_request.id,
        artist_id=booking_request.artist_id,
        client_id=booking_request.client_id,
        services=services,
        sound_fee=quote_for_calc.sound_fee,
        travel_fee=quote_for_calc.travel_fee,
        accommodation=quote_for_calc.accommodation,
        subtotal=subtotal,
        discount=quote_in.discount,
        total=total,
        status=models.QuoteStatusV2.PENDING.value,
        expires_at=quote_in.expires_at,
    )
    db.add(db_quote)
    booking_request.status = models.BookingStatus.QUOTE_PROVIDED
    db.commit()
    db.refresh(db_quote)
    # Create a pending booking shell so client can pay immediately.
    try:
        existing = (
            db.query(models.BookingSimple)
            .filter(models.BookingSimple.quote_id == db_quote.id)
            .first()
        )
        if existing is None:
            bs = models.BookingSimple(
                quote_id=db_quote.id,
                booking_request_id=db_quote.booking_request_id,
                booking_type="standard",
                artist_id=db_quote.artist_id,
                client_id=db_quote.client_id,
                confirmed=False,
                payment_status="pending",
            )
            db.add(bs)
            db.commit()
            db.refresh(bs)
    except Exception as exc:  # best-effort; quote creation must not fail
        logger.warning("Failed to create pending booking shell for quote %s: %s", db_quote.id, exc)
    return db_quote


def get_quote(db: Session, quote_id: int) -> Optional[models.QuoteV2]:
    """Return a quote along with the booking_id if one exists."""
    quote = db.query(models.QuoteV2).filter(models.QuoteV2.id == quote_id).first()
    if quote:
        # Return the formal Booking id so the frontend can fetch full booking
        # details using `/api/v1/bookings/{id}`.
        booking = (
            db.query(models.Booking)
            .filter(models.Booking.quote_id == quote_id)
            .first()
        )
        quote.booking_id = booking.id if booking is not None else None
    return quote


def list_quotes_for_artist(
    db: Session,
    artist_id: int,
    *,
    skip: int = 0,
    limit: int = 100,
) -> list[models.QuoteV2]:
    return (
        db.query(models.QuoteV2)
        .filter(models.QuoteV2.artist_id == artist_id)
        .filter(models.QuoteV2.is_internal.is_(False))
        .order_by(models.QuoteV2.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def list_quotes_for_client(
    db: Session,
    client_id: int,
    *,
    status: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[models.QuoteV2]:
    q = (
        db.query(models.QuoteV2)
        .filter(models.QuoteV2.client_id == client_id)
        .filter(models.QuoteV2.is_internal.is_(False))
        .order_by(models.QuoteV2.created_at.desc())
    )
    if status:
        try:
            status_val = models.QuoteStatusV2(status)
            q = q.filter(models.QuoteV2.status == status_val.value)
        except Exception:
            # Ignore invalid filters; return empty to avoid leaking data
            return []
    return q.offset(skip).limit(limit).all()


def list_quotes_for_booking_request(
    db: Session,
    booking_request_id: int,
) -> list[models.QuoteV2]:
    return (
        db.query(models.QuoteV2)
        .filter(models.QuoteV2.booking_request_id == booking_request_id)
        .order_by(models.QuoteV2.created_at.desc())
        .all()
    )


def list_quotes_by_ids(
    db: Session,
    ids: list[int],
) -> list[models.QuoteV2]:
    if not ids:
        return []
    return (
        db.query(models.QuoteV2)
        .filter(models.QuoteV2.id.in_(ids))
        .all()
    )


def accept_quote(
    db: Session, quote_id: int, service_id: int | None = None
) -> models.BookingSimple:
    """Accept a pending quote and create a booking record.

    This sets the quote status to ``ACCEPTED`` and creates a ``BookingSimple``
    with ``payment_status="pending"``. No payment processing occurs here—the
    intent is only to record that the artist and client have agreed to proceed.
    Future payment integration could call the payment API or an external
    provider after the booking is saved and notifications are sent.
    """

    db_quote = get_quote(db, quote_id)
    if not db_quote:
        raise ValueError("Quote not found")
    if _status_val(db_quote.status) != models.QuoteStatusV2.PENDING.value:
        raise ValueError("Quote cannot be accepted")

    booking_request = db_quote.booking_request
    if booking_request is None:
        logger.error(
            "Booking request missing when accepting quote %s; artist_id=%s client_id=%s",
            quote_id,
            db_quote.artist_id,
            db_quote.client_id,
        )
        raise error_response(
            "Booking request missing", {"booking_request_id": "invalid"}, status.HTTP_422_UNPROCESSABLE_ENTITY
        )

    service = None
    if booking_request.service_id:
        service = (
            db.query(models.Service)
            .filter(models.Service.id == booking_request.service_id)
            .first()
        )
    else:
        if service_id is None:
            logger.error(
                "Booking request %s missing service_id when accepting quote %s and no service_id provided",
                booking_request.id,
                quote_id,
            )
            raise error_response(
                "Booking request missing service_id",
                {"service_id": "required"},
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        service = (
            db.query(models.Service)
            .filter(models.Service.id == service_id)
            .first()
        )
        if not service or service.artist_id != db_quote.artist_id:
            logger.error(
                "Invalid service_id %s for quote %s and artist %s",
                service_id,
                quote_id,
                db_quote.artist_id,
            )
            raise error_response(
                "Invalid service_id",
                {"service_id": "invalid"},
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        booking_request.service_id = service_id
        db.commit()

    if service is None:
        service = booking_request.service

    if (
        service is None
        or service.artist_id != db_quote.artist_id
    ):
        logger.error(
            "Service lookup failed for booking request %s when accepting quote %s",
            booking_request.id,
            quote_id,
        )
        raise error_response(
            "Invalid service_id",
            {"service_id": "invalid"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    if (
        (service.service_type == ServiceType.LIVE_PERFORMANCE or _is_venue_service(service))
        and not booking_request.proposed_datetime_1
    ):
        logger.error(
            "Booking request %s missing proposed_datetime_1 when accepting quote %s; artist_id=%s client_id=%s",
            booking_request.id,
            quote_id,
            db_quote.artist_id,
            db_quote.client_id,
        )
        raise error_response(
            "Booking request is missing a proposed date/time. Please update the request before accepting this quote.",
            {"proposed_datetime_1": "missing"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    db_quote.status = models.QuoteStatusV2.ACCEPTED.value

    # Optionally reject other pending quotes for the same request
    others = (
        db.query(models.QuoteV2)
        .filter(
            models.QuoteV2.booking_request_id == db_quote.booking_request_id,
            models.QuoteV2.status == models.QuoteStatusV2.PENDING.value,
            models.QuoteV2.id != db_quote.id,
        )
        .all()
    )
    for o in others:
        o.status = models.QuoteStatusV2.REJECTED.value

    booking = (
        db.query(models.BookingSimple)
        .filter(models.BookingSimple.quote_id == db_quote.id)
        .first()
    )
    if booking is None:
        booking = models.BookingSimple(
            quote_id=db_quote.id,
            booking_request_id=db_quote.booking_request_id,
            booking_type="standard",
            artist_id=db_quote.artist_id,
            client_id=db_quote.client_id,
            confirmed=True,
            payment_status="pending",
        )
        db.add(booking)

    # Create the full booking record and persist both tables
    db_booking = None
    try:
        db_booking = create_booking_from_quote_v2(db, db_quote)
    except Exception as exc:
        logger.exception("Failed to create Booking from quote %s", quote_id)
        db.rollback()
        raise error_response(
            "Internal Server Error",
            {"booking": "create_failed"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    db.refresh(db_quote)
    db.refresh(booking)

    # Auto-create an invoice for this booking using the quote total
    invoice = crud_invoice.create_invoice_from_quote(db, db_quote, booking)
    db.refresh(invoice)

    # Send notifications to both artist and client
    artist = db_quote.artist
    client = db_quote.client or db.query(models.User).get(db_quote.client_id)
    notify_quote_accepted(db, artist, db_quote.id, db_quote.booking_request_id)

    # Kick off sound outreach if required
    try:
        tb = booking_request.travel_breakdown or {}
        if bool(tb.get("sound_required")) and db_booking is not None:
            event_city = tb.get("event_city") or ""
            selected_sid = tb.get("selected_sound_service_id")
            if isinstance(selected_sid, str):
                try:
                    selected_sid = int(selected_sid)
                except Exception:
                    selected_sid = None
            if event_city:
                kickoff_sound_outreach(
                    db_booking.id,
                    event_city=event_city,
                    request_timeout_hours=24,
                    mode="sequential",
                    selected_service_id=selected_sid,
                    db=db,
                    current_artist=artist,
                )
    except Exception as exc:  # pragma: no cover - best effort only
        logger.warning(
            "Auto outreach failed after client acceptance for booking %s: %s",
            db_booking.id if db_booking else "unknown",
            exc,
        )

    # Do not simulate payment here; payment and receipt issuance happen via the
    # payments API after the client completes checkout.
    try:
        booking.confirmed = True
        db.add(booking)
        db.commit()
        db.refresh(booking)
    except Exception:
        db.rollback()
    try:
        if db_booking and client:
            notify_new_booking(db, client, db_booking.id)
    except Exception:
        logger.warning("Notify new booking failed for booking_id=%s", getattr(db_booking, "id", None))
    return booking


def decline_quote(db: Session, quote_id: int) -> models.QuoteV2:
    """Decline a pending quote without creating a booking."""
    db_quote = get_quote(db, quote_id)
    if not db_quote:
        raise ValueError("Quote not found")
    if _status_val(db_quote.status) != models.QuoteStatusV2.PENDING.value:
        raise ValueError("Quote cannot be declined")

    db_quote.status = models.QuoteStatusV2.REJECTED.value
    db.commit()
    db.refresh(db_quote)

    msg = crud_message.create_message(
        db=db,
        booking_request_id=db_quote.booking_request_id,
        sender_id=db_quote.client_id,
        sender_type=models.SenderType.CLIENT,
        content="Quote declined.",
        message_type=models.MessageType.SYSTEM,
    )
    # Best-effort realtime broadcast for immediate UI update
    try:
        from ..api.api_ws import manager as ws_manager  # type: ignore
        try:
            from .. import schemas
            env = schemas.MessageResponse.model_validate(msg).model_dump()
        except Exception:
            env = {"id": int(getattr(msg, "id", 0) or 0), "booking_request_id": int(db_quote.booking_request_id)}
        import asyncio
        loop = asyncio.get_event_loop()
        if loop and loop.is_running():
            loop.create_task(ws_manager.broadcast(int(db_quote.booking_request_id), env))
    except Exception:
        pass

    # Enqueue outbox for reliable fanout across processes
    try:
        from .. import schemas
        env_decline = schemas.MessageResponse.model_validate(msg).model_dump()
        enqueue_outbox(db, topic=f"booking-requests:{int(db_quote.booking_request_id)}", payload=env_decline)
    except Exception:
        pass

    return db_quote


def withdraw_quote(db: Session, quote_id: int, *, actor_id: int) -> models.QuoteV2:
    """Artist-initiated withdrawal; maps to rejected."""
    db_quote = get_quote(db, quote_id)
    if not db_quote:
        raise ValueError("Quote not found")
    if db_quote.artist_id != actor_id:
        raise ValueError("Not authorized to withdraw this quote")
    if _status_val(db_quote.status) != models.QuoteStatusV2.PENDING.value:
        raise ValueError("Only pending quotes can be withdrawn")

    db_quote.status = models.QuoteStatusV2.REJECTED.value
    db.commit()
    db.refresh(db_quote)

    # System message for thread visibility
    try:
        msg = crud_message.create_message(
            db=db,
            booking_request_id=db_quote.booking_request_id,
            sender_id=db_quote.artist_id,
            sender_type=models.SenderType.ARTIST,
            content="Quote withdrawn by artist.",
            message_type=models.MessageType.SYSTEM,
        )
        try:
            from ..api.api_ws import manager as ws_manager  # type: ignore
            payload = schemas.MessageResponse.model_validate(msg).model_dump()
            import asyncio
            loop = asyncio.get_event_loop()
            if loop and loop.is_running():
                loop.create_task(ws_manager.broadcast(int(db_quote.booking_request_id), payload))
        except Exception:
            pass
        try:
            payload = schemas.MessageResponse.model_validate(msg).model_dump()
            enqueue_outbox(db, topic=f"booking-requests:{int(db_quote.booking_request_id)}", payload=payload)
        except Exception:
            pass
    except Exception:
        pass

    return db_quote


def expire_pending_quotes(db: Session) -> list[models.QuoteV2]:
    """Mark all pending quotes past their expiry as expired and post messages."""
    now = datetime.utcnow()
    candidates = (
        db.query(models.QuoteV2)
        .filter(
            models.QuoteV2.status == models.QuoteStatusV2.PENDING.value,
            models.QuoteV2.expires_at != None,
            models.QuoteV2.expires_at < now,
        )
        .all()
    )
    # Skip quotes that already have a fully paid lightweight booking linked
    expired: list[models.QuoteV2] = []
    for q in candidates:
        try:
            paid = (
                db.query(models.BookingSimple)
                .filter(
                    models.BookingSimple.quote_id == q.id,
                    models.BookingSimple.payment_status == "paid",
                )
                .first()
            )
            if paid:
                # Do not mark as expired or emit a system message for paid quotes
                continue
        except Exception:
            # Best-effort: if the check fails, fall back to expiring the quote
            pass
        q.status = models.QuoteStatusV2.EXPIRED.value
        expired.append(q)
    if expired:
        db.commit()
        for q in expired:
            db.refresh(q)
            msg2 = crud_message.create_message(
                db=db,
                booking_request_id=q.booking_request_id,
                sender_id=q.artist_id,
                sender_type=models.SenderType.ARTIST,
                content="Quote expired.",
                message_type=models.MessageType.SYSTEM,
            )
            try:
                from ..api.api_ws import manager as ws_manager  # type: ignore
                try:
                    from .. import schemas
                    env2 = schemas.MessageResponse.model_validate(msg2).model_dump()
                except Exception:
                    env2 = {"id": int(getattr(msg2, "id", 0) or 0), "booking_request_id": int(q.booking_request_id)}
                import asyncio
                loop = asyncio.get_event_loop()
                if loop and loop.is_running():
                    loop.create_task(ws_manager.broadcast(int(q.booking_request_id), env2))
            except Exception:
                pass
            # Also enqueue outbox for cross-process reliable fanout
            try:
                from .. import schemas
                env_for_outbox = schemas.MessageResponse.model_validate(msg2).model_dump()
                enqueue_outbox(db, topic=f"booking-requests:{int(q.booking_request_id)}", payload=env_for_outbox)
            except Exception:
                pass
    return expired
