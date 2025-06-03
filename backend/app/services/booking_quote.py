"""Utilities to calculate comprehensive booking quotes."""

from decimal import Decimal
from typing import Optional

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

    total = base_fee + calculate_travel_cost(distance_km)
    if provider and provider.price_per_event:
        total += provider.price_per_event
    if accommodation_cost:
        total += accommodation_cost
    return total.quantize(Decimal("0.01"))
