from decimal import Decimal
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..utils import error_response
from pydantic import BaseModel

router = APIRouter(tags=["pricebooks"])


@router.get("/services/{service_id}/pricebook", response_model=schemas.PricebookRead)
def get_pricebook(service_id: int, db: Session = Depends(get_db)):
    pb = (
        db.query(models.SupplierPricebook)
        .filter(models.SupplierPricebook.service_id == service_id)
        .first()
    )
    if not pb:
        raise error_response("Pricebook not found", {"service_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    return pb


@router.post("/services/{service_id}/pricebook", response_model=schemas.PricebookRead, status_code=status.HTTP_201_CREATED)
def upsert_pricebook(service_id: int, pb_in: schemas.PricebookCreate, db: Session = Depends(get_db)):
    pb = (
        db.query(models.SupplierPricebook)
        .filter(models.SupplierPricebook.service_id == service_id)
        .first()
    )
    if pb:
        for field in ["pricebook", "km_rate", "min_callout", "reliability_score", "base_location"]:
            val = getattr(pb_in, field, None)
            if val is not None:
                setattr(pb, field, val)
        db.add(pb)
        db.commit()
        db.refresh(pb)
        return pb
    pb = models.SupplierPricebook(
        service_id=service_id,
        pricebook=pb_in.pricebook,
        km_rate=pb_in.km_rate,
        min_callout=pb_in.min_callout,
        reliability_score=pb_in.reliability_score,
        base_location=pb_in.base_location,
    )
    db.add(pb)
    db.commit()
    db.refresh(pb)
    return pb


def _estimate_from_rider(
    pb: models.SupplierPricebook,
    rider_spec: dict,
    distance_km: float,
    managed_markup: float = 0.0,
    guest_count: int | None = None,
    *,
    backline_required: bool | None = None,
    lighting_evening: bool | None = None,
    outdoor: bool | None = None,
    stage_size: str | None = None,
) -> tuple[Decimal, Decimal, dict]:
    book = pb.pricebook or {}
    # Prefer audience tier pricing if configured and guest_count provided
    base = Decimal("0")
    tiers = book.get("audience_tiers") or []
    if guest_count is not None and isinstance(tiers, list) and tiers:
        selected = None
        for t in tiers:
            tmin = t.get("min")
            tmax = t.get("max")
            if tmin is not None and guest_count < int(tmin):
                continue
            if tmax is None or int(guest_count) <= int(tmax):
                selected = t
                break
        if selected is None:
            selected = tiers[-1]
        base = Decimal(str(selected.get("price", 0)))
    else:
        foh_tier = (rider_spec.get("foh_tier") or "M").upper()
        foh_prices = book.get("foh", {})
        base = Decimal(str(foh_prices.get(foh_tier, 0)))

    # Add-ons (simple linear model + scenario add-ons)
    addons = Decimal("0")
    monitors = int(rider_spec.get("monitors", 0))
    mon_rate = Decimal(str(book.get("monitors_per_mix", 0)))
    addons += mon_rate * monitors
    wireless = int(rider_spec.get("wireless", 0))
    wireless_rate = Decimal(str(book.get("wireless_per_channel", 0)))
    addons += wireless_rate * wireless
    dis = int(rider_spec.get("di", 0))
    di_rate = Decimal(str(book.get("di_per_unit", 0)))
    addons += di_rate * dis
    # Scenario-based add-ons from pricebook
    try:
        if backline_required and isinstance(book.get("backline"), dict):
            addons += Decimal(str(book["backline"].get("addon", 0)))
        if lighting_evening and isinstance(book.get("lighting"), dict):
            addons += Decimal(str(book["lighting"].get("evening_addon", 0)))
        if outdoor and isinstance(book.get("outdoor"), dict):
            addons += Decimal(str(book["outdoor"].get("surcharge", 0)))
        if stage_size and isinstance(book.get("stage"), dict):
            sizes = book["stage"].get("sizes") or []
            for s in sizes:
                if str(s.get("size", "")).lower() == stage_size.lower():
                    addons += Decimal(str(s.get("price", 0)))
                    break
    except Exception:
        pass

    # Travel (drive only)
    travel = Decimal(str(pb.km_rate or 0)) * Decimal(str(distance_km or 0))
    if pb.min_callout and travel < Decimal(str(pb.min_callout)):
        travel = Decimal(str(pb.min_callout))

    crew = Decimal("0")  # can expand later
    subtotal = base + addons + travel + crew

    # Managed by artist markup applied to subtotal
    if managed_markup and managed_markup > 0:
        subtotal = subtotal * Decimal(str(1 + managed_markup / 100.0))

    variance = Decimal("0.10")  # ±10%
    est_min = (subtotal * (Decimal("1.0") - variance)).quantize(Decimal("0.01"))
    est_max = (subtotal * (Decimal("1.0") + variance)).quantize(Decimal("0.01"))
    return est_min, est_max, {
        "base": base,
        "addons": addons,
        "travel": travel,
        "crew": crew,
    }


@router.post("/services/{service_id}/pricebook/estimate", response_model=schemas.EstimateOut)
def estimate_price(
    service_id: int,
    body: schemas.EstimateIn,
    db: Session = Depends(get_db),
):
    pb = (
        db.query(models.SupplierPricebook)
        .filter(models.SupplierPricebook.service_id == service_id)
        .first()
    )
    if not pb:
        raise error_response("Pricebook not found", {"service_id": "not_found"}, status.HTTP_404_NOT_FOUND)

    managed_markup = body.artist_managed_markup_percent if body.managed_by_artist else 0
    est_min, est_max, parts = _estimate_from_rider(
        pb,
        body.rider_spec,
        body.distance_km,
        managed_markup,
        body.guest_count,
        backline_required=body.backline_required,
        lighting_evening=body.lighting_evening,
        outdoor=body.outdoor,
        stage_size=body.stage_size,
    )
    return schemas.EstimateOut(
        estimate_min=est_min,
        estimate_max=est_max,
        base=parts["base"],
        addons=parts["addons"],
        travel=parts["travel"],
        crew=parts["crew"],
    )


class BatchCandidate(BaseModel):
    service_id: int
    distance_km: float


class BatchEstimateIn(BaseModel):
    rider_spec: dict
    guest_count: int | None = None
    candidates: list[BatchCandidate]
    preferred_ids: list[int] | None = None
    managed_by_artist: bool = False
    artist_managed_markup_percent: float = 0
    backline_required: bool | None = None
    lighting_evening: bool | None = None
    outdoor: bool | None = None
    stage_size: str | None = None


class RankedEstimate(BaseModel):
    service_id: int
    estimate_min: Decimal
    estimate_max: Decimal
    reliability: float
    preferred: bool
    distance_km: float


@router.post("/pricebook/batch-estimate-rank", response_model=list[RankedEstimate])
def batch_estimate_rank(body: "BatchEstimateIn", db: Session = Depends(get_db)):
    results: list[RankedEstimate] = []
    preferred_set = set(body.preferred_ids or [])
    for cand in body.candidates:
        pb = (
            db.query(models.SupplierPricebook)
            .filter(models.SupplierPricebook.service_id == cand.service_id)
            .first()
        )
        if not pb:
            continue
        managed_markup = body.artist_managed_markup_percent if body.managed_by_artist else 0
        est_min, est_max, _parts = _estimate_from_rider(
            pb,
            body.rider_spec,
            cand.distance_km,
            managed_markup,
            body.guest_count,
            backline_required=body.backline_required,
            lighting_evening=body.lighting_evening,
            outdoor=body.outdoor,
            stage_size=body.stage_size,
        )
        reliability = float(pb.reliability_score) if pb and pb.reliability_score is not None else 0.0
        results.append(
            RankedEstimate(
                service_id=cand.service_id,
                estimate_min=est_min,
                estimate_max=est_max,
                reliability=reliability,
                preferred=cand.service_id in preferred_set,
                distance_km=cand.distance_km,
            )
        )
    # Sort by: preferred (True first), distance asc, estimate_min asc, reliability desc
    results.sort(key=lambda r: (
        0 if r.preferred else 1,
        r.distance_km,
        float(r.estimate_min),
        -r.reliability,
    ))
    return results[:3]
