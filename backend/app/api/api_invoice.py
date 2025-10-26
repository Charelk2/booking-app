from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import logging

from .. import models, schemas, crud
from ..database import get_db
from .dependencies import get_current_user
from ..utils import error_response

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
    if not invoice or (
        invoice.client_id != current_user.id and invoice.artist_id != current_user.id
    ):
        raise error_response(
            "Invoice not found",
            {"invoice_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
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
    if not invoice or (
        invoice.client_id != current_user.id and invoice.artist_id != current_user.id
    ):
        raise error_response(
            "Invoice not found",
            {"invoice_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
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
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return FileResponse(path, media_type="application/pdf", filename=filename)
