from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel

from ..models.invoice import InvoiceStatus


class InvoiceRead(BaseModel):
    id: int
    quote_id: int
    booking_id: int
    artist_id: int
    client_id: int
    issue_date: date
    due_date: Optional[date] = None
    amount_due: Decimal
    status: InvoiceStatus
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    pdf_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InvoiceMarkPaid(BaseModel):
    payment_method: Optional[str] = None
    notes: Optional[str] = None
