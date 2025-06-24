from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field
from datetime import datetime


class ServiceItem(BaseModel):
    description: str
    price: Decimal


class QuoteTemplateBase(BaseModel):
    artist_id: int
    name: str
    services: List[ServiceItem]
    sound_fee: Decimal = Field(default=0)
    travel_fee: Decimal = Field(default=0)
    accommodation: Optional[str] = None
    discount: Optional[Decimal] = None


class QuoteTemplateCreate(QuoteTemplateBase):
    pass


class QuoteTemplateUpdate(BaseModel):
    name: Optional[str] = None
    services: Optional[List[ServiceItem]] = None
    sound_fee: Optional[Decimal] = None
    travel_fee: Optional[Decimal] = None
    accommodation: Optional[str] = None
    discount: Optional[Decimal] = None


class QuoteTemplateRead(QuoteTemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

