from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field


class PvStatus(str, enum.Enum):
    """Lifecycle states for Personalized Video orders (v2)."""

    AWAITING_PAYMENT = "awaiting_payment"
    PAID = "paid"
    IN_PRODUCTION = "in_production"
    DELIVERED = "delivered"
    COMPLETED = "completed"

    IN_DISPUTE = "in_dispute"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class PvPayload(BaseModel):
    """Payload persisted under booking_requests.service_extras['pv']."""

    status: PvStatus = Field(default=PvStatus.AWAITING_PAYMENT)

    delivery_by_utc: Optional[str] = None
    length_sec: Optional[int] = None
    language: Optional[str] = None
    tone: Optional[str] = None
    recipient_name: Optional[str] = None

    contact_email: Optional[str] = None
    contact_whatsapp: Optional[str] = None
    promo_code: Optional[str] = None

    price_base: Decimal = Field(default=Decimal("0"))
    price_rush: Decimal = Field(default=Decimal("0"))
    price_addons: Decimal = Field(default=Decimal("0"))
    discount: Decimal = Field(default=Decimal("0"))
    total: Decimal = Field(default=Decimal("0"))

    answers: dict[str, Any] = Field(default_factory=dict)

    booking_simple_id: Optional[int] = None
    quote_id: Optional[int] = None
    payout_state: Optional[str] = None
    paystack_reference: Optional[str] = None

    awaiting_payment_at_utc: Optional[datetime] = None
    paid_at_utc: Optional[datetime] = None
    in_production_at_utc: Optional[datetime] = None
    delivered_at_utc: Optional[datetime] = None
    completed_at_utc: Optional[datetime] = None
    auto_complete_at_utc: Optional[datetime] = None
    cancelled_at_utc: Optional[datetime] = None
    refunded_at_utc: Optional[datetime] = None

    # Be permissive for legacy fields we haven't modeled yet.
    model_config = {"extra": "allow"}

