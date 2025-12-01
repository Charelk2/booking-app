"""Facade for quote engines.

This module preserves the original public API (`calculate_quote_breakdown`,
`calculate_quote`, `_normalize_rider_for_pricing`) while delegating the
implementation to service-specific engines under :mod:`app.service_types`.

New code should import from the service-type engines directly
(`app.service_types.live_performance`, `app.service_types.sound_service`).
This module exists to keep legacy imports, tests, and older APIs working
without duplicating logic.
"""

from app.service_types.live_performance import (
    calculate_quote,
    calculate_quote_breakdown,
    normalize_rider_for_pricing as _normalize_rider_for_pricing,
)

# Backwards compatibility: the contextual sound calculator in the live engine
# now delegates to the shared sound service pricebook engine. Keep an alias
# to avoid breaking imports in legacy callers/tests.
from app.service_types.sound_service import estimate_sound_service_total as _compute_sound_service_price  # noqa: F401

__all__ = [
    "calculate_quote",
    "calculate_quote_breakdown",
    "_normalize_rider_for_pricing",
    "_compute_sound_service_price",
]
