"""Estimate travel cost for driving vs flights.

This module provides a lightweight server-side counterpart to the frontend
travel engine. It intentionally stays simple and deterministic so it can be
used inside quote calculations without external API calls.

The goals are:
* Keep driving estimates in the same ballpark as the Booking Wizard
  (≈R2.50/km by default).
* Still expose a notional flight option so downstream logic that branches on
  ``travel_mode`` (e.g. sound provisioning overrides) continues to work.
"""

from __future__ import annotations

from decimal import Decimal
from typing import List, Dict

import logging

logger = logging.getLogger(__name__)


# Default rates chosen to roughly mirror the client-side travel engine:
# - Driving: ~R2.50 per km (no fixed call-out here; any minimums are handled
#   at a higher layer like supplier pricebooks).
# - Flights: a per-km rate that is cheaper than driving for very long trips,
#   plus a fixed base to keep short hops more expensive than driving.
DRIVING_RATE_PER_KM = Decimal("2.5")
FLIGHT_BASE_COST = Decimal("500")
FLIGHT_RATE_PER_KM = Decimal("1.5")


def estimate_travel(distance_km: float) -> List[Dict[str, Decimal]]:
    """Return cost estimates for different travel modes.

    Given a one-way trip distance in kilometres, return approximate costs for
    driving and flying. These estimates are used by
    :func:`booking_quote.calculate_quote_breakdown` to choose a travel mode
    and expose both options to the frontend.

    Parameters
    ----------
    distance_km: float
        The trip distance in kilometres.

    Returns
    -------
    List[Dict[str, Decimal]]
        List of dictionaries with ``mode`` and ``cost`` keys.
    """

    if distance_km < 0:
        raise ValueError("distance_km must be non-negative")

    # Normalise to a Decimal; tolerate None/zero-like inputs.
    try:
        distance = Decimal(str(distance_km or 0))
    except Exception:
        distance = Decimal("0")

    # Driving: simple per-km rate, charged for a round-trip. For example, a
    # 249km one-way trip at R2.50/km is billed as 249km * 2 * R2.50.
    driving_cost = DRIVING_RATE_PER_KM * distance * Decimal("2")

    # Flights: a rough affine model that becomes cheaper than driving for
    # sufficiently long trips (so "flight" remains a viable mode for very
    # long distances) while staying more expensive on short/medium hops.
    flight_cost = FLIGHT_BASE_COST + (FLIGHT_RATE_PER_KM * distance)

    estimates = [
        {"mode": "driving", "cost": driving_cost},
        {"mode": "flight", "cost": flight_cost},
    ]

    logger.debug(
        "Travel estimates computed",
        extra={"distance_km": float(distance_km or 0), "estimates": estimates},
    )
    return estimates
