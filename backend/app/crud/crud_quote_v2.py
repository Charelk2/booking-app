from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from .. import models, schemas
from ..utils.notifications import notify_quote_accepted, notify_new_booking


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
    db_quote = models.QuoteV2(
        booking_request_id=quote_in.booking_request_id,
        artist_id=quote_in.artist_id,
        client_id=quote_in.client_id,
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
    db.commit()
    db.refresh(db_quote)
    return db_quote


def get_quote(db: Session, quote_id: int) -> Optional[models.QuoteV2]:
    return db.query(models.QuoteV2).filter(models.QuoteV2.id == quote_id).first()


def accept_quote(db: Session, quote_id: int) -> models.BookingSimple:
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
    )
    db.add(booking)
    db.commit()
    db.refresh(db_quote)
    db.refresh(booking)

    # Send notifications to both artist and client
    artist = db_quote.artist
    client = db_quote.client
    notify_quote_accepted(db, artist, db_quote.id)
    notify_new_booking(db, client, booking.id)

    return booking

