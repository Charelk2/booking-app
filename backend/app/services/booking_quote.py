"""Utilities to calculate comprehensive booking quotes."""

from decimal import Decimal
from typing import Optional, Dict

from ..models import SoundProvider, ArtistProfile


DEFAULT_TRAVEL_RATE_PER_KM = Decimal("0.5")


def calculate_travel_cost(distance_km: float) -> Decimal:
    """Return simple travel cost based on distance."""
    return Decimal(distance_km) * DEFAULT_TRAVEL_RATE_PER_KM


def calculate_quote(
    base_fee: Decimal,
    distance_km: float,
    provider: Optional[SoundProvider] = None,
    accommodation_cost: Optional[Decimal] = None,
) -> Decimal:
    """Aggregate various cost components into a final quote."""

    breakdown = calculate_quote_breakdown(
        base_fee, distance_km, provider, accommodation_cost
    )
    return breakdown["total"]


def calculate_quote_breakdown(
    base_fee: Decimal,
    distance_km: float,
    provider: Optional[SoundProvider] = None,
    accommodation_cost: Optional[Decimal] = None,
) -> Dict[str, Decimal]:
    """Return a detailed cost breakdown including the grand total."""

    travel_cost = calculate_travel_cost(distance_km)
    provider_cost = (
        provider.price_per_event if provider and provider.price_per_event else Decimal("0.00")
    )
    accommodation = accommodation_cost or Decimal("0.00")

    total = base_fee + travel_cost + provider_cost + accommodation

    return {
        "base_fee": base_fee.quantize(Decimal("0.01")),
        "travel_cost": travel_cost.quantize(Decimal("0.01")),
        "provider_cost": provider_cost.quantize(Decimal("0.01")),
        "accommodation_cost": accommodation.quantize(Decimal("0.01")),
        "total": total.quantize(Decimal("0.01")),
    }
