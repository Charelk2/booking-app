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
from .crud_booking import create_booking_from_quote_v2
from . import crud_invoice, crud_message
from ..api.api_sound_outreach import kickoff_sound_outreach

logger = logging.getLogger(__name__)


def calculate_totals(quote_in: schemas.QuoteV2Create) -> tuple[Decimal, Decimal]:
    subtotal = sum(item.price for item in quote_in.services)
    subtotal += quote_in.sound_fee + quote_in.travel_fee
    total = subtotal - (quote_in.discount or Decimal("0"))
    return subtotal, total


def create_quote(db: Session, quote_in: schemas.QuoteV2Create) -> models.QuoteV2:
    subtotal, total = calculate_totals(quote_in)
    services = [
        {"description": s.description, "price": float(s.price)}
        for s in quote_in.services
    ]
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
    # Always rely on the booking request for the artist and client IDs. This
    # avoids situations where the payload omits or mislabels these values,
    # ensuring downstream notifications target the correct recipient.
    db_quote = models.QuoteV2(
        booking_request_id=booking_request.id,
        artist_id=booking_request.artist_id,
        client_id=booking_request.client_id,
        services=services,
        sound_fee=quote_in.sound_fee,
        travel_fee=quote_in.travel_fee,
        accommodation=quote_in.accommodation,
        subtotal=subtotal,
        discount=quote_in.discount,
        total=total,
        status=models.QuoteStatusV2.PENDING,
        expires_at=quote_in.expires_at,
    )
    db.add(db_quote)
    booking_request.status = models.BookingStatus.QUOTE_PROVIDED
    db.commit()
    db.refresh(db_quote)
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
    if db_quote.status != models.QuoteStatusV2.PENDING:
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
        service.service_type == ServiceType.LIVE_PERFORMANCE
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

    db_quote.status = models.QuoteStatusV2.ACCEPTED

    # Optionally reject other pending quotes for the same request
    others = (
        db.query(models.QuoteV2)
        .filter(
            models.QuoteV2.booking_request_id == db_quote.booking_request_id,
            models.QuoteV2.status == models.QuoteStatusV2.PENDING,
            models.QuoteV2.id != db_quote.id,
        )
        .all()
    )
    for o in others:
        o.status = models.QuoteStatusV2.REJECTED

    booking = models.BookingSimple(
        quote_id=db_quote.id,
        artist_id=db_quote.artist_id,
        client_id=db_quote.client_id,
        confirmed=True,
        # No charge is triggered yet; payment will be collected later
        payment_status="pending",
        deposit_amount=db_quote.total * Decimal("0.5"),
        deposit_due_by=datetime.utcnow() + timedelta(days=7),
        deposit_paid=False,
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

    # Simulate payment and issue a mock receipt for testing
    try:
        payment_id = f"test_{uuid.uuid4().hex}"
        booking.payment_status = "deposit_paid"
        booking.deposit_paid = True
        booking.payment_id = payment_id

        receipt_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "static", "receipts")
        )
        os.makedirs(receipt_dir, exist_ok=True)
        receipt_path = os.path.join(receipt_dir, f"{payment_id}.pdf")
        with open(receipt_path, "wb") as f:
            f.write(b"%PDF-1.4 test receipt\n%%EOF")

        crud_message.create_message(
            db=db,
            booking_request_id=db_quote.booking_request_id,
            sender_id=db_quote.client_id,
            sender_type=models.SenderType.CLIENT,
            content=(
                f"Deposit received. Receipt: /api/v1/payments/{payment_id}/receipt"
            ),
            message_type=models.MessageType.SYSTEM,
        )

        notify_new_booking(db, artist, booking.id)
        notify_new_booking(db, client, booking.id)
    except Exception as exc:  # pragma: no cover - best effort only
        logger.warning(
            "Failed to simulate payment for booking %s: %s", booking.id, exc
        )

    return booking


def decline_quote(db: Session, quote_id: int) -> models.QuoteV2:
    """Decline a pending quote without creating a booking."""
    db_quote = get_quote(db, quote_id)
    if not db_quote:
        raise ValueError("Quote not found")
    if db_quote.status != models.QuoteStatusV2.PENDING:
        raise ValueError("Quote cannot be declined")

    db_quote.status = models.QuoteStatusV2.REJECTED
    db.commit()
    db.refresh(db_quote)

    crud_message.create_message(
        db=db,
        booking_request_id=db_quote.booking_request_id,
        sender_id=db_quote.client_id,
        sender_type=models.SenderType.CLIENT,
        content="Quote declined.",
        message_type=models.MessageType.SYSTEM,
    )

    return db_quote


def expire_pending_quotes(db: Session) -> list[models.QuoteV2]:
    """Mark all pending quotes past their expiry as expired and post messages."""
    now = datetime.utcnow()
    expired = (
        db.query(models.QuoteV2)
        .filter(
            models.QuoteV2.status == models.QuoteStatusV2.PENDING,
            models.QuoteV2.expires_at != None,
            models.QuoteV2.expires_at < now,
        )
        .all()
    )
    for q in expired:
        q.status = models.QuoteStatusV2.EXPIRED
    if expired:
        db.commit()
        for q in expired:
            db.refresh(q)
            crud_message.create_message(
                db=db,
                booking_request_id=q.booking_request_id,
                sender_id=q.artist_id,
                sender_type=models.SenderType.ARTIST,
                content="Quote expired.",
                message_type=models.MessageType.SYSTEM,
            )
    return expired
