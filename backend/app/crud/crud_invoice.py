from datetime import date
from sqlalchemy.orm import Session

from .. import models


def create_invoice_from_quote(db: Session, quote: models.QuoteV2, booking: models.BookingSimple) -> models.Invoice:
    invoice = models.Invoice(
        quote_id=quote.id,
        booking_id=booking.id,
        artist_id=quote.artist_id,
        client_id=quote.client_id,
        issue_date=date.today(),
        amount_due=quote.total,
        status=models.InvoiceStatus.UNPAID,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def get_invoice(db: Session, invoice_id: int) -> models.Invoice | None:
    return db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()


def mark_paid(db: Session, invoice: models.Invoice, payment_method: str | None = None, notes: str | None = None) -> models.Invoice:
    invoice.status = models.InvoiceStatus.PAID
    invoice.payment_method = payment_method
    if notes is not None:
        invoice.notes = notes
    db.commit()
    db.refresh(invoice)
    return invoice


def get_invoice_by_booking(db: Session, booking_id: int) -> models.Invoice | None:
    return (
        db.query(models.Invoice)
        .filter(models.Invoice.booking_id == int(booking_id))
        .order_by(models.Invoice.id.desc())
        .first()
    )


def get_invoice_by_quote(db: Session, quote_id: int) -> models.Invoice | None:
    return (
        db.query(models.Invoice)
        .filter(models.Invoice.quote_id == int(quote_id))
        .order_by(models.Invoice.id.desc())
        .first()
    )


def ensure_invoice_for_booking(
    db: Session, quote: models.QuoteV2 | None, booking: models.BookingSimple
) -> models.Invoice | None:
    """Return an existing invoice or create one from the quote/booking.

    Returns None if no quote is available (cannot create line totals reliably).
    """
    try:
        # Prefer booking match; also check by quote to prevent dupes
        existing = get_invoice_by_booking(db, int(booking.id))
        if existing:
            return existing
        if quote is not None:
            existing_q = get_invoice_by_quote(db, int(quote.id))
            if existing_q:
                return existing_q
        if quote is None:
            # Best-effort only; caller may handle None
            return None
        return create_invoice_from_quote(db, quote, booking)
    except Exception:
        # Never block payment flow on invoice creation failures
        return None
