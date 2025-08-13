from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from ..models.quote_v2 import QuoteStatusV2


class ServiceItem(BaseModel):
    description: str
    price: Decimal


class QuoteCreate(BaseModel):
    booking_request_id: int
    artist_id: int
    client_id: int
    services: List[ServiceItem]
    sound_fee: Decimal = Field(default=0)
    travel_fee: Decimal = Field(default=0)
    accommodation: Optional[str] = None
    discount: Optional[Decimal] = None
    expires_at: Optional[datetime] = None


class QuoteRead(QuoteCreate):
    id: int
    booking_id: Optional[int] = None
    subtotal: Decimal
    total: Decimal
    status: QuoteStatusV2
    sound_firm: Optional[bool] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BookingSimpleRead(BaseModel):
    id: int
    quote_id: int
    artist_id: int
    client_id: int
    confirmed: bool
    date: Optional[datetime] = None
    location: Optional[str] = None
    payment_status: str
    payment_id: Optional[str] = None
    deposit_amount: Optional[Decimal] = None
    deposit_due_by: Optional[datetime] = None
    deposit_paid: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
