from decimal import Decimal
from typing import Dict, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, crud
from ..utils import error_response


router = APIRouter(tags=["sound-estimate"])


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


class SoundEstimateOut(BaseModel):
    base: Decimal
    addons: Decimal
    unit_addons: Decimal
    backline: Decimal
    total: Decimal
    items: list[dict]


def _to_num(val, default=0) -> float:
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        try:
            return float(val)
        except Exception:
            return float(default)
    return float(default)


@router.post("/services/{service_id}/sound-estimate", response_model=SoundEstimateOut)
def sound_estimate(service_id: int, body: SoundEstimateIn, db: Session = Depends(get_db)):
    svc = crud.service.get_service(db, service_id)
    if not svc:
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    details = svc.details or {}
    pkgs = details.get("audience_packages") or []
    if not isinstance(pkgs, list) or not pkgs:
        return SoundEstimateOut(base=Decimal("0"), addons=Decimal("0"), unit_addons=Decimal("0"), backline=Decimal("0"), total=Decimal("0"), items=[])

    # Select audience band by guest_count
    gid = None
    g = int(body.guest_count or 0)
    if g <= 100:
        gid = "0_100"
    elif g <= 200:
        gid = "101_200"
    elif g <= 500:
        gid = "201_500"
    elif g <= 1000:
        gid = "501_1000"
    else:
        gid = "1000_plus"
    selected = None
    for p in pkgs:
        if (p.get("active", True)) and p.get("id") == gid:
            selected = p
            break
    if not selected:
        # fallback to first active
        for p in pkgs:
            if p.get("active", True):
                selected = p
                break
    if not selected:
        return SoundEstimateOut(base=Decimal("0"), addons=Decimal("0"), unit_addons=Decimal("0"), backline=Decimal("0"), total=Decimal("0"), items=[])

    vt = (body.venue_type or "indoor").lower()
    applied_kind = "outdoor" if vt in ("outdoor", "hybrid") else "indoor"
    base_field = "outdoor_base_zar" if applied_kind == "outdoor" else "indoor_base_zar"
    base_amount = Decimal(str(_to_num(selected.get(base_field), 0)))
    items: list[dict] = [
        {"key": "audience_base", "label": f"Audience Package {selected.get('label') or selected.get('id')} ({applied_kind})", "amount": base_amount},
    ]
    addons = Decimal("0")

    # Stage
    if body.stage_required and body.stage_size:
        stages = details.get("stage_prices") or {}
        stage_amt = Decimal(str(_to_num(stages.get(str(body.stage_size)), 0)))
        if stage_amt > 0:
            addons += stage_amt
            items.append({"key": "stage", "label": f"Stage {body.stage_size}", "amount": stage_amt})

    # Lighting
    included = (selected.get("included") or {}).get("lighting") or "none"
    lighting_prices = details.get("lighting_prices") or {}
    basic = Decimal(str(_to_num(lighting_prices.get("basic"), 0)))
    adv = Decimal(str(_to_num(lighting_prices.get("advanced"), 0)))
    tech_day = Decimal(str(_to_num((details.get("addon_unit_prices") or {}).get("lighting_tech_day_rate_zar"), 0)))
    adv_includes_tech = bool((details.get("addon_unit_prices") or {}).get("advanced_includes_tech"))
    if body.lighting_evening:
        delta = adv - basic
        if included in (None, "none"):
            if basic > 0:
                addons += basic
                items.append({"key": "lighting_basic", "label": "Lighting (Basic)", "amount": basic})
            if body.upgrade_lighting_advanced and delta > 0:
                addons += delta
                items.append({"key": "lighting_upgrade", "label": "Upgrade to Advanced", "amount": delta})
                if (not adv_includes_tech) and tech_day > 0:
                    addons += tech_day
                    items.append({"key": "lighting_tech", "label": "Lighting tech (day rate)", "amount": tech_day})
        elif included == "basic":
            if body.upgrade_lighting_advanced and delta > 0:
                addons += delta
                items.append({"key": "lighting_upgrade", "label": "Upgrade to Advanced", "amount": delta})
                if (not adv_includes_tech) and tech_day > 0:
                    addons += tech_day
                    items.append({"key": "lighting_tech", "label": "Lighting tech (day rate)", "amount": tech_day})

    # Unit add-ons (extras above included)
    inc = selected.get("included") or {}
    u = body.rider_units or RiderUnits()
    unit_prices = (details.get("addon_unit_prices") or {})
    unit_addons = Decimal("0")
    def add_units(key: str, label: str, requested: int, included_count: int, price_key: str):
        nonlocal unit_addons
        extra = max(0, int(requested) - int(included_count))
        rate = Decimal(str(_to_num(unit_prices.get(price_key), 0)))
        if extra > 0 and rate > 0:
            amt = rate * Decimal(str(extra))
            unit_addons += amt
            items.append({"key": price_key, "label": f"{label} ×{extra}", "amount": amt})

    add_units("vocal_mics", "Extra vocal mics", int(u.vocal_mics or 0), int(inc.get("vocal_mics") or 0), "extra_vocal_mic_zar")
    add_units("speech_mics", "Extra speech mics", int(u.speech_mics or 0), int(inc.get("speech_mics") or 0), "extra_speech_mic_zar")
    add_units("monitor_mixes", "Extra monitor mixes", int(u.monitor_mixes or 0), int(inc.get("monitors") or 0), "extra_monitor_mix_zar")
    add_units("iem_packs", "IEM packs", int(u.iem_packs or 0), 0, "extra_iem_pack_zar")
    add_units("di_boxes", "Extra DI boxes", int(u.di_boxes or 0), int(inc.get("di_boxes") or 0), "extra_di_box_zar")

    # Backline
    bl = details.get("backline_prices") or {}
    bl_req = body.backline_requested or {}
    backline_total = Decimal("0")
    for k, qty in bl_req.items():
        try:
            q = max(0, int(qty or 0))
            if q == 0:
                continue
            row = bl.get(k)
            price = None
            enabled = False
            if isinstance(row, dict):
                enabled = bool(row.get("enabled"))
                price = _to_num(row.get("price_zar"), 0)
            else:
                # support legacy: price is a number/null
                enabled = row is not None
                price = _to_num(row, 0)
            if enabled and price and price > 0:
                amt = Decimal(str(price)) * Decimal(str(q))
                backline_total += amt
                items.append({"key": f"backline_{k}", "label": f"Backline: {k} ×{q}", "amount": amt})
        except Exception:
            continue

    total = base_amount + addons + unit_addons + backline_total
    return SoundEstimateOut(
        base=base_amount.quantize(Decimal("0.01")),
        addons=addons.quantize(Decimal("0.01")),
        unit_addons=unit_addons.quantize(Decimal("0.01")),
        backline=backline_total.quantize(Decimal("0.01")),
        total=total.quantize(Decimal("0.01")),
        items=[{"key": it["key"], "label": it["label"], "amount": Decimal(str(it["amount"]))} for it in items],
    )
