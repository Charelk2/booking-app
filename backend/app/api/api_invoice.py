from fastapi import APIRouter, Depends, status, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
import os
import logging

from .. import models, schemas, crud
from ..core.config import settings
from ..crud import crud_invoice as inv
from ..database import get_db, SessionLocal
from .dependencies import get_current_user
from ..utils import error_response
from ..utils import r2 as r2utils

router = APIRouter(tags=["invoices"])
logger = logging.getLogger(__name__)

INVOICE_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "invoices")
os.makedirs(INVOICE_DIR, exist_ok=True)


def ensure_invoice_pdf_stored(db: Session, invoice: models.Invoice) -> str | None:
    """Ensure a PDF for this invoice is generated, uploaded to R2, and pdf_url persisted.

    Returns the public URL (not presigned) when available; None on failure.
    Safe to call multiple times; it will no-op when pdf_url already exists.
    """
    try:
        public = getattr(invoice, "pdf_url", None)
    except Exception:
        public = None
    if public:
        return str(public)

    # Lazy import to avoid heavy deps during OpenAPI generation.
    # Select renderer based on invoice_type when available.
    try:
        inv_type = getattr(invoice, "invoice_type", None)
    except Exception:
        inv_type = None
    pdf_bytes = None
    if inv_type and str(inv_type).lower() in {"provider_tax", "provider_invoice"}:
        try:
            from ..services import provider_invoice_pdf as _prov_pdf  # type: ignore
            pdf_bytes = _prov_pdf.generate_pdf(invoice)
        except Exception:
            pdf_bytes = None
    elif inv_type and str(inv_type).lower() == "commission_tax":
        try:
            from ..services import commission_invoice_pdf as _com_pdf  # type: ignore
            pdf_bytes = _com_pdf.generate_pdf(invoice)
        except Exception:
            pdf_bytes = None
    elif inv_type and str(inv_type).lower() == "client_fee_tax":
        try:
            from ..services import client_fee_invoice_pdf as _fee_pdf  # type: ignore
            pdf_bytes = _fee_pdf.generate_pdf(invoice)
        except Exception:
            pdf_bytes = None
    if pdf_bytes is None:
        from ..services import invoice_pdf  # type: ignore
        pdf_bytes = invoice_pdf.generate_pdf(invoice)

    filename = f"invoice_{invoice.id}.pdf"
    path = os.path.join(INVOICE_DIR, filename)
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as f:
            f.write(pdf_bytes)
    except Exception:
        # If local write fails, we still attempt R2 upload below if possible.
        pass

    try:
        key = r2utils.build_receipt_key(f"invoice-{invoice.id}")  # reuse receipts prefix for simplicity
        r2utils.put_bytes(key, pdf_bytes, content_type="application/pdf")
        public_url = (
            f"{r2utils.R2Config().public_base_url}/{key}"
            if r2utils.R2Config().public_base_url
            else None
        )
        if public_url:
            try:
                invoice.pdf_url = public_url
                db.add(invoice)
                db.commit()
                db.refresh(invoice)
            except Exception:
                db.rollback()
            return public_url
    except Exception:
        pass

    return None


def _background_generate_invoice_pdf(invoice_id: int) -> None:
    """Background entrypoint: open a session and generate the invoice PDF best-effort."""
    try:
        with SessionLocal() as session:  # type: ignore
            try:
                inv_row = crud.crud_invoice.get_invoice(session, int(invoice_id))
            except Exception:
                inv_row = None
            if not inv_row:
                return
            try:
                ensure_invoice_pdf_stored(session, inv_row)
            except Exception:
                logger.debug("ensure_invoice_pdf_stored failed (background)", exc_info=True)
    except Exception:
        logger.debug("SessionLocal for invoice pdf generation failed", exc_info=True)


@router.get("/{invoice_id}", response_model=schemas.InvoiceRead)
def read_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    invoice = crud.crud_invoice.get_invoice(db, invoice_id)
    if not invoice:
        raise error_response(
            "Invoice not found",
            {"invoice_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not is_admin and (invoice.client_id != current_user.id and invoice.artist_id != current_user.id):
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    # Defensive: ensure timestamps for response validation
    try:
        from datetime import datetime as _dt
        if not getattr(invoice, "created_at", None):
            invoice.created_at = getattr(invoice, "updated_at", None) or _dt.utcnow()
        if not getattr(invoice, "updated_at", None):
            invoice.updated_at = invoice.created_at
        db.add(invoice)
        db.commit()
        db.refresh(invoice)
    except Exception:
        pass
    payload = schemas.InvoiceRead.model_validate(invoice).model_dump()
    try:
        payload["invoice_type"] = getattr(invoice, "invoice_type", None)
    except Exception:
        pass
    return payload


@router.post("/{invoice_id}/mark-paid", response_model=schemas.InvoiceRead)
def mark_invoice_paid(
    invoice_id: int,
    mark: schemas.InvoiceMarkPaid,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    invoice = crud.crud_invoice.get_invoice(db, invoice_id)
    if not invoice:
        raise error_response(
            "Invoice not found",
            {"invoice_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not is_admin and (invoice.client_id != current_user.id and invoice.artist_id != current_user.id):
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    updated = crud.crud_invoice.mark_paid(db, invoice, mark.payment_method, mark.notes)
    try:
        from datetime import datetime as _dt
        if not getattr(updated, "created_at", None):
            updated.created_at = getattr(updated, "updated_at", None) or _dt.utcnow()
        if not getattr(updated, "updated_at", None):
            updated.updated_at = updated.created_at
        db.add(updated)
        db.commit()
        db.refresh(updated)
    except Exception:
        pass
    return schemas.InvoiceRead.model_validate(updated)


@router.get("/{invoice_id}/pdf")
def get_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    invoice = crud.crud_invoice.get_invoice(db, invoice_id)
    if not invoice or (
        invoice.client_id != current_user.id and invoice.artist_id != current_user.id
    ):
        raise error_response(
            "Invoice not found",
            {"invoice_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    # If we already have a stored public URL pointing at R2, prefer a presigned
    # redirect without regenerating the PDF.
    try:
        public = getattr(invoice, "pdf_url", None)
    except Exception:
        public = None
    if public:
        try:
            signed = r2utils.presign_get_for_public_url(str(public))
        except Exception:
            signed = None
        if signed:
            return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    public_url = ensure_invoice_pdf_stored(db, invoice)
    if public_url:
        try:
            signed = r2utils.presign_get_for_public_url(str(public_url))
        except Exception:
            signed = None
        if signed:
            return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    filename = f"invoice_{invoice.id}.pdf"
    path = os.path.join(INVOICE_DIR, filename)
    return FileResponse(path, media_type="application/pdf", filename=filename)
@router.get("/by-booking/{booking_id}", response_model=schemas.InvoiceByBooking)
def get_invoice_by_booking(
    booking_id: int,
    type: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Fetch a specific invoice by formal Booking id.

    Query param `type` selects which invoice to return:
      - provider (default): provider_tax/provider_invoice
      - client_fee: client_fee_tax
      - commission: commission_tax

    Returns 404 when not found; never 500. Response includes both
    user-facing booking_id and internal booking_simple_id.
    """
    booking = db.query(models.Booking).filter(models.Booking.id == int(booking_id)).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    simple = (
        db.query(models.BookingSimple)
        .filter(models.BookingSimple.quote_id == booking.quote_id)
        .first()
    )
    if not simple:
        raise error_response("Invoice not found", {"invoice": "not_found"}, status.HTTP_404_NOT_FOUND)
    inv = crud.crud_invoice.get_invoice_by_booking_and_type(db, int(simple.id), type or "provider")
    if not inv:
        raise error_response("Invoice not found", {"invoice": "not_found"}, status.HTTP_404_NOT_FOUND)
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not is_admin and inv.client_id != current_user.id and inv.artist_id != current_user.id:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    # Build augmented response including both booking ids
    from datetime import datetime as _dt
    created = getattr(inv, "created_at", None) or _dt.utcnow()
    updated = getattr(inv, "updated_at", None) or created
    return schemas.InvoiceByBooking(
        id=int(inv.id),
        quote_id=int(inv.quote_id),
        booking_id=int(booking.id),
        booking_simple_id=int(simple.id),
        artist_id=int(inv.artist_id),
        client_id=int(inv.client_id),
        issue_date=inv.issue_date,
        due_date=getattr(inv, "due_date", None),
        amount_due=inv.amount_due,
        status=inv.status,
        invoice_type=getattr(inv, "invoice_type", None),
        payment_method=getattr(inv, "payment_method", None),
        notes=getattr(inv, "notes", None),
        pdf_url=getattr(inv, "pdf_url", None),
        created_at=created,
        updated_at=updated,
    )


@router.get("/by-quote/{quote_id}", response_model=schemas.InvoiceRead)
def get_invoice_by_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    inv = crud.crud_invoice.get_invoice_by_quote(db, int(quote_id))
    if not inv:
        raise error_response("Invoice not found", {"invoice": "not_found"}, status.HTTP_404_NOT_FOUND)
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not is_admin and inv.client_id != current_user.id and inv.artist_id != current_user.id:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    try:
        from datetime import datetime as _dt
        if not getattr(inv, "created_at", None):
            inv.created_at = getattr(inv, "updated_at", None) or _dt.utcnow()
        if not getattr(inv, "updated_at", None):
            inv.updated_at = inv.created_at
    except Exception:
        pass
    return schemas.InvoiceRead.model_validate(inv)


# ─── Creation Endpoints (basic) ───────────────────────────────────────────────

@router.post("/provider/{booking_id}")
def create_provider_invoice(booking_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not settings.ENABLE_SPLIT_INVOICING:
        raise error_response("Feature disabled", {}, status.HTTP_403_FORBIDDEN)
    b = db.query(models.BookingSimple).filter(models.BookingSimple.id == int(booking_id)).first()
    if not b:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not (is_admin or current_user.id == b.artist_id):
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    # Vendor detection via provider profile (best-effort)
    prof = db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == int(b.artist_id)).first()
    vendor = bool(getattr(prof, 'vat_registered', False))
    row = inv.create_provider_invoice(db, b, vendor=vendor)
    return {"id": int(row.id), "invoice_number": row.invoice_number, "invoice_type": row.invoice_type}


@router.post("/commission/{booking_id}")
def create_commission_invoice(booking_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not settings.ENABLE_SPLIT_INVOICING:
        raise error_response("Feature disabled", {}, status.HTTP_403_FORBIDDEN)
    b = db.query(models.BookingSimple).filter(models.BookingSimple.id == int(booking_id)).first()
    if not b:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    # Admin-only
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not is_admin:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    row = inv.create_commission_invoice(db, b)
    return {"id": int(row.id), "invoice_number": row.invoice_number, "invoice_type": row.invoice_type}


@router.post("/client-fee/{booking_id}")
def create_client_fee_invoice(booking_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not settings.ENABLE_SPLIT_INVOICING:
        raise error_response("Feature disabled", {}, status.HTTP_403_FORBIDDEN)
    b = db.query(models.BookingSimple).filter(models.BookingSimple.id == int(booking_id)).first()
    if not b:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    # Admin-only
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not is_admin:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    row = inv.create_client_fee_invoice(db, b)
    return {"id": int(row.id), "invoice_number": row.invoice_number, "invoice_type": row.invoice_type}


@router.post("/booking/{booking_id}/client-billing")
def set_client_billing_snapshot(booking_id: int, payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Set or update client billing snapshot for a booking's BookingSimple.

    Payload may include company_name, vat_number, and address fields.
    """
    if not settings.ENABLE_SPLIT_INVOICING:
        raise error_response("Feature disabled", {}, status.HTTP_403_FORBIDDEN)
    b = db.query(models.BookingSimple).filter(models.BookingSimple.id == int(booking_id)).first()
    if not b:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not (is_admin or current_user.id == b.client_id):
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    try:
        snap = dict(payload or {})
        b.client_billing_snapshot = snap
        db.add(b)
        db.commit()
        db.refresh(b)
        return {"status": "ok"}
    except Exception:
        db.rollback()
        raise error_response("Update failed", {"client_billing_snapshot": "invalid"}, status.HTTP_400_BAD_REQUEST)


@router.post("/booking-request/{booking_request_id}/client-billing")
def set_client_billing_snapshot_by_request(booking_request_id: int, payload: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Set/update client billing snapshot for the BookingSimple associated to a booking request.

    Resolves QuoteV2 via booking_request_id then finds/creates the BookingSimple shell.
    """
    qv2 = (
        db.query(models.QuoteV2)
        .filter(models.QuoteV2.booking_request_id == int(booking_request_id))
        .order_by(models.QuoteV2.id.desc())
        .first()
    )
    if not qv2:
        raise error_response("Quote not found", {"booking_request_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    bs = db.query(models.BookingSimple).filter(models.BookingSimple.quote_id == qv2.id).first()
    if not bs:
        # Create a lightweight shell if missing (best-effort)
        bs = models.BookingSimple(
            quote_id=qv2.id,
            artist_id=qv2.artist_id,
            client_id=qv2.client_id,
            confirmed=False,
            payment_status="pending",
        )
    try:
        if not (is_admin or current_user.id == qv2.client_id):
            raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
        snap = dict(payload or {})
        bs.client_billing_snapshot = snap
        db.add(bs)
        db.commit()
        db.refresh(bs)
        return {"status": "ok"}
    except Exception:
        db.rollback()
        raise error_response("Update failed", {"client_billing_snapshot": "invalid"}, status.HTTP_400_BAD_REQUEST)
