from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from .. import models, schemas


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
    db_quote = get_quote(db, quote_id)
    if not db_quote:
        raise ValueError("Quote not found")
    if db_quote.status != models.QuoteStatusV2.PENDING:
        raise ValueError("Quote cannot be accepted")

    db_quote.status = models.QuoteStatusV2.ACCEPTED
    booking = models.BookingSimple(
        quote_id=db_quote.id,
        artist_id=db_quote.artist_id,
        client_id=db_quote.client_id,
        confirmed=True,
    )
    db.add(booking)
    db.commit()
    db.refresh(db_quote)
    db.refresh(booking)
    return booking

