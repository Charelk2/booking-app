from decimal import Decimal
from typing import Dict, Optional

from pydantic import BaseModel, Field


class RiderUnits(BaseModel):
    vocal_mics: int | None = 0
    speech_mics: int | None = 0
    monitor_mixes: int | None = 0
    iem_packs: int | None = 0
    di_boxes: int | None = 0


class SoundEstimateIn(BaseModel):
    guest_count: int = Field(0, ge=0)
    venue_type: str = Field("indoor")  # indoor|outdoor|hybrid
    stage_required: bool = False
    stage_size: Optional[str] = None  # S|M|L
    lighting_evening: bool = False
    upgrade_lighting_advanced: bool = False
    rider_units: Optional[RiderUnits] = None
    backline_requested: Optional[Dict[str, int]] = None


class SoundEstimateWithService(SoundEstimateIn):
    service_id: int


class SoundEstimateOut(BaseModel):
    base: Decimal
    addons: Decimal
    unit_addons: Decimal
    backline: Decimal
    total: Decimal
    items: list[dict]
