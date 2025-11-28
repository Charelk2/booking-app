"""Facade for quote engines.

This module preserves the original public API (`calculate_quote_breakdown`,
`calculate_quote`, `_normalize_rider_for_pricing`) while delegating the
implementation to service-specific engines under `quote_engines/`.
"""

from .quote_engines.live_performance import (
    calculate_quote,
    calculate_quote_breakdown,
    normalize_rider_for_pricing as _normalize_rider_for_pricing,
)

# Backwards compatibility: the contextual sound calculator in the live engine
# now delegates to the shared sound service pricebook engine. Keep an alias
# to avoid breaking imports in legacy callers/tests.
from .quote_engines.sound_service import estimate_sound_service_total as _compute_sound_service_price  # noqa: F401

__all__ = [
    "calculate_quote",
    "calculate_quote_breakdown",
    "_normalize_rider_for_pricing",
    "_compute_sound_service_price",
]
