"""Utilities to calculate comprehensive booking quotes."""

from decimal import Decimal
from typing import Optional, Dict, Any

from .travel_estimator import estimate_travel


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

    total = base_fee + travel_cost + accommodation

    return {
        "base_fee": base_fee.quantize(Decimal("0.01")),
        "travel_cost": travel_cost.quantize(Decimal("0.01")),
        "travel_mode": travel_mode,
        "travel_estimates": [
            {"mode": e["mode"], "cost": e["cost"].quantize(Decimal("0.01"))}
            for e in estimates
        ],
        "accommodation_cost": accommodation.quantize(Decimal("0.01")),
        "total": total.quantize(Decimal("0.01")),
    }
