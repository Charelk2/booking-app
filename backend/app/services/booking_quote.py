"""Utilities to calculate comprehensive booking quotes."""

from decimal import Decimal
from typing import Optional, Dict, Any, Tuple

from sqlalchemy.orm import Session

from .travel_estimator import estimate_travel
from ..crud import crud_service
from ..models import Service


def calculate_quote(
    base_fee: Decimal,
    distance_km: float,
    accommodation_cost: Optional[Decimal] = None,
) -> Decimal:
    """Aggregate various cost components into a final quote."""

    breakdown = calculate_quote_breakdown(base_fee, distance_km, accommodation_cost)
    return breakdown["total"]


def calculate_quote_breakdown(
    base_fee: Decimal,
    distance_km: float,
    accommodation_cost: Optional[Decimal] = None,
    *,
    service: Optional[Service] = None,
    event_city: Optional[str] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """Return a detailed cost breakdown including the grand total.

    Travel costs are predicted via :mod:`travel_estimator` rather than a flat
    rate so the quote reflects likely real-world expenses. The cheapest travel
    mode is chosen for the total, while all mode estimates are returned for
    display on the frontend.
    """

    estimates = estimate_travel(distance_km)
    best = min(estimates, key=lambda e: e["cost"]) if estimates else {"mode": "unknown", "cost": Decimal("0")}
    travel_cost = best["cost"]
    travel_mode = best["mode"]

    accommodation = accommodation_cost or Decimal("0.00")

    sound_cost = Decimal("0")
    sound_mode = "none"
    sound_mode_overridden = False
    sound_provider_id: Optional[int] = None

    if service and event_city and db:
        sound_cost, sound_mode, sound_provider_id, sound_mode_overridden = _estimate_sound_cost(
            service, event_city, travel_mode, db
        )

    total = base_fee + travel_cost + accommodation + sound_cost

    return {
        "base_fee": base_fee.quantize(Decimal("0.01")),
        "travel_cost": travel_cost.quantize(Decimal("0.01")),
        "travel_mode": travel_mode,
        "travel_estimates": [
            {"mode": e["mode"], "cost": e["cost"].quantize(Decimal("0.01"))}
            for e in estimates
        ],
        "accommodation_cost": accommodation.quantize(Decimal("0.01")),
        "sound_cost": sound_cost.quantize(Decimal("0.01")),
        "sound_mode": sound_mode,
        "sound_mode_overridden": sound_mode_overridden,
        "sound_provider_id": sound_provider_id,
        "total": total.quantize(Decimal("0.01")),
    }


def _estimate_sound_cost(
    service: Service,
    event_city: str,
    travel_mode: str,
    db: Session,
) -> Tuple[Decimal, str, Optional[int], bool]:
    """Determine sound cost based on the musician's provisioning settings."""

    details = service.details or {}
    sound = details.get("sound_provisioning") or {}
    mode = sound.get("mode")

    if not mode:
        return Decimal("0"), "none", None, False

    def provider_cost() -> Tuple[Decimal, Optional[int]]:
        """Resolve a provider's service cost for the event city.

        Attempts to match a provider in the requested ``event_city``. If no
        explicit match is found, falls back to the first configured provider in
        the musician's preferences. The lookup ignores providers without a
        stored price.
        """

        city_prefs = sound.get("city_preferences", [])

        def first_cost(ids: list[int]) -> Tuple[Decimal, Optional[int]]:
            for pid in ids:
                provider_service = crud_service.service.get_service(db, pid)
                if provider_service and provider_service.price:
                    return Decimal(str(provider_service.price)), pid
            return Decimal("0"), None

        # Try exact city match first
        for pref in city_prefs:
            if pref.get("city", "").lower() == event_city.lower():
                cost, pid = first_cost(pref.get("provider_ids") or [])
                if pid:
                    return cost, pid
                break

        # Fallback to the first provider in the list with a price
        for pref in city_prefs:
            cost, pid = first_cost(pref.get("provider_ids") or [])
            if pid:
                return cost, pid

        return Decimal("0"), None

    if mode == "own_sound_drive_only":
        if travel_mode == "flight":
            cost, pid = provider_cost()
            return cost, "external_providers", pid, True
        return Decimal("0"), mode, None, False

    if mode == "artist_arranged_flat":
        flat = sound.get("flat_price_zar") or 0
        return Decimal(str(flat)), mode, None, False

    if mode == "artist_provides_variable":
        # New combined flow: artist provides sound with two prices based on travel mode
        drv = Decimal(str(sound.get("price_driving_sound_zar") or 0))
        fly = Decimal(str(sound.get("price_flying_sound_zar") or 0))
        if travel_mode == "flight":
            return fly, mode, None, False
        return drv, mode, None, False

    if mode == "external_providers":
        cost, pid = provider_cost()
        return cost, mode, pid, False

    return Decimal("0"), mode, None, False
