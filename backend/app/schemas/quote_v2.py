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


class QuoteTotalsPreview(BaseModel):
    provider_subtotal: Optional[Decimal] = None
    platform_fee_ex_vat: Optional[Decimal] = None
    platform_fee_vat: Optional[Decimal] = None
    client_total_incl_vat: Optional[Decimal] = None


class QuoteRead(QuoteCreate):
    id: int
    booking_id: Optional[int] = None
    subtotal: Decimal
    total: Decimal
    status: QuoteStatusV2
    sound_firm: Optional[bool] = None
    created_at: datetime
    updated_at: datetime

    totals_preview: Optional[QuoteTotalsPreview] = None

    # DEPRECATED legacy preview fields (retain for compatibility)
    provider_subtotal_preview: Optional[Decimal] = None
    booka_fee_preview: Optional[Decimal] = None
    booka_fee_vat_preview: Optional[Decimal] = None
    client_total_preview: Optional[Decimal] = None
    rates_preview: Optional[dict] = None

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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
