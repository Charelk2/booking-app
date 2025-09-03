"""Estimate travel cost using simple regression model."""

from __future__ import annotations

from decimal import Decimal
from typing import List, Dict

import logging

logger = logging.getLogger(__name__)


def estimate_travel(distance_km: float) -> List[Dict[str, Decimal]]:
    """Return cost estimates for different travel modes.

    A tiny linear regression approximates the cost for driving and flying. In a
    real system this could call an external API or a trained model. We return a
    list of estimates so callers can choose the most suitable mode.

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

    distance = Decimal(str(distance_km))

    # Simple regressions for demo purposes
    driving_cost = (Decimal("0.45") * distance) + Decimal("20")
    flight_cost = (Decimal("0.25") * distance) + Decimal("120")

    estimates = [
        {"mode": "driving", "cost": driving_cost},
        {"mode": "flight", "cost": flight_cost},
    ]

    logger.debug("Travel estimates computed", extra={"distance_km": distance_km, "estimates": estimates})
    return estimates
