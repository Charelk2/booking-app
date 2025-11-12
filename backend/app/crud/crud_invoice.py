from datetime import date, datetime
import os
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..core.config import settings


def _yyyymm_now() -> str:
    return datetime.utcnow().strftime("%Y%m")


def allocate_invoice_number(db: Session, series_key: str, prefix: str, yyyymm: str | None = None) -> str:
    """Reserve and return the next invoice number for a series.

    Uses the invoice_sequences table and a short critical section.
    """
    yyyymm = yyyymm or _yyyymm_now()
    # Portable increment with minimal race surface
    row = db.execute(text("SELECT current_seq FROM invoice_sequences WHERE series_key=:k"), {"k": series_key}).fetchone()
    if not row:
        try:
            db.execute(text("INSERT INTO invoice_sequences(series_key, current_seq) VALUES (:k, 0)"), {"k": series_key})
            db.flush()
        except Exception:
            pass  # another transaction inserted first
        row = db.execute(text("SELECT current_seq FROM invoice_sequences WHERE series_key=:k"), {"k": series_key}).fetchone()
    seq = int((row[0] if row else 0) or 0) + 1
    number = f"{prefix}-{yyyymm}-{seq:05d}"
    db.execute(text("UPDATE invoice_sequences SET current_seq=:s WHERE series_key=:k"), {"s": seq, "k": series_key})
    return number


def _provider_snapshot(db: Session, provider_id: int) -> dict:
    prof = db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == provider_id).first()
    snap = {}
    if prof:
        for k in (
            "legal_name","business_name","billing_address_line1","billing_address_line2","billing_city","billing_region",
            "billing_postal_code","billing_country","invoice_email","vat_registered","vat_number","vat_rate","agent_invoicing_consent",
        ):
            snap[k] = getattr(prof, k, None)
    return snap


def _client_snapshot(db: Session, booking: models.BookingSimple, client_id: int) -> dict:
    user = db.query(models.User).filter(models.User.id == client_id).first()
    base = {"name": f"{getattr(user,'first_name','') or ''} {getattr(user,'last_name','') or ''}".strip(), "email": getattr(user,'email',None)} if user else {}
    try:
        if getattr(booking, 'client_billing_snapshot', None):
            base.update(booking.client_billing_snapshot or {})
    except Exception:
        pass
    return base


def create_provider_invoice(db: Session, booking: models.BookingSimple, vendor: bool = True) -> models.Invoice:
    qv2 = db.query(models.QuoteV2).filter(models.QuoteV2.id == booking.quote_id).first()
    if not qv2:
        raise ValueError("quote_missing")
    # Idempotency: avoid duplicates for provider invoices on same booking
    existing = (
        db.query(models.Invoice)
        .filter(models.Invoice.booking_id == booking.id)
        .filter(models.Invoice.invoice_type.in_(["provider_tax", "provider_invoice"]))
        .order_by(models.Invoice.id.desc())
        .first()
    )
    if existing:
        return existing

    # Compute amount_due: EX base (+ supplier VAT if vendor)
    base_ex = _quote_base_ex(qv2)
    supplier_vat_rate = 0.0
    if vendor:
        try:
            prof = db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == qv2.artist_id).first()
            if prof and bool(getattr(prof, 'vat_registered', False)):
                try:
                    supplier_vat_rate = float(getattr(prof, 'vat_rate', 0.15) or 0.15)
                except Exception:
                    supplier_vat_rate = 0.15
        except Exception:
            supplier_vat_rate = 0.15
    amount_due = round(base_ex * (1 + supplier_vat_rate), 2) if vendor else round(base_ex, 2)

    invoice = models.Invoice(
        quote_id=qv2.id,
        booking_id=booking.id,
        artist_id=qv2.artist_id,
        client_id=qv2.client_id,
        issue_date=date.today(),
        amount_due=amount_due,
        status=models.InvoiceStatus.PAID,
        invoice_type="provider_tax" if vendor else "provider_invoice",
        issuer_snapshot=_provider_snapshot(db, qv2.artist_id),
        recipient_snapshot=_client_snapshot(db, booking, qv2.client_id),
    )
    series_key = f"INV-{qv2.artist_id}-{_yyyymm_now()}"
    invoice.invoice_number = allocate_invoice_number(db, series_key, f"INV-{qv2.artist_id}")
    db.add(invoice)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        invoice.invoice_number = allocate_invoice_number(db, series_key, f"INV-{qv2.artist_id}")
        db.add(invoice)
        db.commit()
    db.refresh(invoice)
    return invoice


def _quote_base_ex(qv2: models.QuoteV2) -> float:
    try:
        return float((qv2.subtotal or 0) - (qv2.discount or 0))
    except Exception:
        return float(qv2.subtotal or 0)


def create_commission_invoice(db: Session, booking: models.BookingSimple) -> models.Invoice:
    qv2 = db.query(models.QuoteV2).filter(models.QuoteV2.id == booking.quote_id).first()
    if not qv2:
        raise ValueError("quote_missing")
    base_ex = _quote_base_ex(qv2)
    COMMISSION_RATE = float(os.getenv('COMMISSION_RATE', '0.075') or 0.075)
    VAT_RATE = float(os.getenv('VAT_RATE', '0.15') or 0.15)
    commission_ex = round(base_ex * COMMISSION_RATE, 2)
    amount_due = round(commission_ex * (1 + VAT_RATE), 2)
    invoice = models.Invoice(
        quote_id=qv2.id,
        booking_id=booking.id,
        artist_id=qv2.artist_id,
        client_id=qv2.client_id,
        issue_date=date.today(),
        amount_due=amount_due,
        status=models.InvoiceStatus.PAID,
        invoice_type="commission_tax",
        issuer_snapshot={"legal_name": "Booka (Pty) Ltd", "vat_number": os.getenv('BOOKA_VAT_NUMBER','')},
        recipient_snapshot=_provider_snapshot(db, qv2.artist_id),
    )
    series_key = f"COM-{_yyyymm_now()}"
    invoice.invoice_number = allocate_invoice_number(db, series_key, "COM")
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def create_client_fee_invoice(db: Session, booking: models.BookingSimple) -> models.Invoice:
    qv2 = db.query(models.QuoteV2).filter(models.QuoteV2.id == booking.quote_id).first()
    if not qv2:
        raise ValueError("quote_missing")
    base_ex = _quote_base_ex(qv2)
    CLIENT_FEE_RATE = float(os.getenv('CLIENT_FEE_RATE', '0.03') or 0.03)
    VAT_RATE = float(os.getenv('VAT_RATE', '0.15') or 0.15)
    fee_ex = round(base_ex * CLIENT_FEE_RATE, 2)
    amount_due = round(fee_ex * (1 + VAT_RATE), 2)
    invoice = models.Invoice(
        quote_id=qv2.id,
        booking_id=booking.id,
        artist_id=qv2.artist_id,
        client_id=qv2.client_id,
        issue_date=date.today(),
        amount_due=amount_due,
        status=models.InvoiceStatus.PAID,
        invoice_type="client_fee_tax",
        issuer_snapshot={"legal_name": "Booka (Pty) Ltd", "vat_number": os.getenv('BOOKA_VAT_NUMBER','')},
        recipient_snapshot=_client_snapshot(db, booking, qv2.client_id),
    )
    series_key = f"FEE-{_yyyymm_now()}"
    invoice.invoice_number = allocate_invoice_number(db, series_key, "FEE")
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


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
