from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel

from ..models.invoice import InvoiceStatus, InvoiceType


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
    invoice_type: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    pdf_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InvoiceMarkPaid(BaseModel):
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class InvoiceByBooking(BaseModel):
    """Augmented read model when fetching by formal Booking id.

    Includes both the user-facing Booking.id and the internal BookingSimple.id
    so clients can reason about links and finance records unambiguously.
    """
    id: int
    quote_id: int
    booking_id: int  # formal Booking.id
    booking_simple_id: int  # internal bookings_simple.id
    artist_id: int
    client_id: int
    issue_date: date
    due_date: Optional[date] = None
    amount_due: Decimal
    status: InvoiceStatus
    invoice_type: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    pdf_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
