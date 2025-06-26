from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import logging

from .. import models, schemas, crud
from ..database import get_db
from .dependencies import get_current_user
from ..services import invoice_pdf

router = APIRouter(tags=["invoices"])
logger = logging.getLogger(__name__)

INVOICE_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "invoices")
os.makedirs(INVOICE_DIR, exist_ok=True)


@router.get("/{invoice_id}", response_model=schemas.InvoiceRead)
def read_invoice(invoice_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    invoice = crud.crud_invoice.get_invoice(db, invoice_id)
    if not invoice or (invoice.client_id != current_user.id and invoice.artist_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return schemas.InvoiceRead.model_validate(invoice)


@router.post("/{invoice_id}/mark-paid", response_model=schemas.InvoiceRead)
def mark_invoice_paid(invoice_id: int, mark: schemas.InvoiceMarkPaid, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    invoice = crud.crud_invoice.get_invoice(db, invoice_id)
    if not invoice or (invoice.client_id != current_user.id and invoice.artist_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    updated = crud.crud_invoice.mark_paid(db, invoice, mark.payment_method, mark.notes)
    return schemas.InvoiceRead.model_validate(updated)


@router.get("/{invoice_id}/pdf")
def get_invoice_pdf(invoice_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    invoice = crud.crud_invoice.get_invoice(db, invoice_id)
    if not invoice or (invoice.client_id != current_user.id and invoice.artist_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    pdf_bytes = invoice_pdf.generate_pdf(invoice)
    filename = f"invoice_{invoice.id}.pdf"
    path = os.path.join(INVOICE_DIR, filename)
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return FileResponse(path, media_type="application/pdf", filename=filename)
