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
