from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
import os
import logging

from .. import models, schemas, crud
from ..database import get_db
from .dependencies import get_current_user
from ..utils import error_response
from ..utils import r2 as r2utils

router = APIRouter(tags=["invoices"])
logger = logging.getLogger(__name__)

INVOICE_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "invoices")
os.makedirs(INVOICE_DIR, exist_ok=True)


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
    return schemas.InvoiceRead.model_validate(invoice)


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
    # Lazy import to avoid heavy deps during OpenAPI generation
    from ..services import invoice_pdf  # type: ignore
    pdf_bytes = invoice_pdf.generate_pdf(invoice)
    filename = f"invoice_{invoice.id}.pdf"
    path = os.path.join(INVOICE_DIR, filename)
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as f:
            f.write(pdf_bytes)
    except Exception:
        # If we cannot write locally, still try serving from memory
        pass

    # Prefer R2: upload and return a presigned URL (inline)
    try:
        key = r2utils.build_receipt_key(f"invoice-{invoice.id}")  # reuse receipts prefix for simplicity
        r2utils.put_bytes(key, pdf_bytes, content_type="application/pdf")
        signed = r2utils.presign_get_by_key(key, filename=filename, content_type="application/pdf", inline=True)
        # Best-effort: persist public URL to invoice.pdf_url
        try:
            public_url = f"{r2utils.R2Config().public_base_url}/{key}" if r2utils.R2Config().public_base_url else None
            if public_url:
                try:
                    invoice.pdf_url = public_url
                    db.add(invoice)
                    db.commit()
                    db.refresh(invoice)
                except Exception:
                    db.rollback()
        except Exception:
            pass
        return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception:
        # Fall back to local file response
        return FileResponse(path, media_type="application/pdf", filename=filename)
@router.get("/by-booking/{booking_id}", response_model=schemas.InvoiceRead)
def get_invoice_by_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Fetch the invoice for a formal Booking id.

    Resolves Booking -> BookingSimple via quote_id, then returns the invoice.
    """
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    simple = (
        db.query(models.BookingSimple)
        .filter(models.BookingSimple.quote_id == booking.quote_id)
        .first()
    )
    if not simple:
        raise error_response("Invoice not found", {"invoice": "not_found"}, status.HTTP_404_NOT_FOUND)
    inv = crud.crud_invoice.get_invoice_by_booking(db, int(simple.id))
    if not inv:
        raise error_response("Invoice not found", {"invoice": "not_found"}, status.HTTP_404_NOT_FOUND)
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not is_admin and inv.client_id != current_user.id and inv.artist_id != current_user.id:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)
    # Defensive timestamp ensure (no commit on read)
    try:
        from datetime import datetime as _dt
        if not getattr(inv, "created_at", None):
            inv.created_at = getattr(inv, "updated_at", None) or _dt.utcnow()
        if not getattr(inv, "updated_at", None):
            inv.updated_at = inv.created_at
    except Exception:
        pass
    return schemas.InvoiceRead.model_validate(inv)


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
