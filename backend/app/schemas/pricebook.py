from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from decimal import Decimal


class PricebookCreate(BaseModel):
    service_id: int
    pricebook: Dict[str, Any]
    km_rate: Decimal = Field(default=0)
    min_callout: Optional[Decimal] = None
    reliability_score: Optional[Decimal] = None
    base_location: Optional[str] = None


class PricebookUpdate(BaseModel):
    pricebook: Optional[Dict[str, Any]] = None
    km_rate: Optional[Decimal] = None
    min_callout: Optional[Decimal] = None
    reliability_score: Optional[Decimal] = None
    base_location: Optional[str] = None


class PricebookRead(BaseModel):
    id: int
    service_id: int
    pricebook: Dict[str, Any]
    km_rate: Decimal
    min_callout: Optional[Decimal] = None
    reliability_score: Optional[Decimal] = None
    base_location: Optional[str] = None

    model_config = {"from_attributes": True}


class EstimateIn(BaseModel):
    rider_spec: Dict[str, Any]
    distance_km: float = 0
    managed_by_artist: bool = False
    artist_managed_markup_percent: float = 0
    guest_count: int | None = None
    backline_required: bool | None = None
    lighting_evening: bool | None = None
    outdoor: bool | None = None
    stage_size: str | None = None


class EstimateOut(BaseModel):
    estimate_min: Decimal
    estimate_max: Decimal
    base: Decimal
    addons: Decimal
    travel: Decimal
    crew: Decimal
