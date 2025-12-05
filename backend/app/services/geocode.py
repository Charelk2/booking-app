"""Simple address geocoding helper with Redis caching.

Provides a single entrypoint `geocode_address(address)` that returns a
`GeocodeResult` (lat/lng) or `None` when geocoding is unavailable.

- Prefers the `GOOGLE_MAPS_API_KEY` env but will also fall back to
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` so deployments that already have a
  frontend key configured can reuse it on the backend.
- Uses Redis for coarse caching keyed by the normalized address string.
- Fails fast and returns `None` when:
  - No API key is configured,
  - The Google Geocoding API is unreachable or returns no results.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import logging
import os

import httpx

from app.utils.redis_cache import get_redis_client

logger = logging.getLogger(__name__)


@dataclass
class GeocodeResult:
    lat: float
    lng: float


def _cache_key(address: str) -> str:
    return f"geo:addr:{address.strip().lower()}"


async def geocode_address_async(address: str) -> Optional[GeocodeResult]:
    """Async geocoding with simple Redis caching.

    Returns `GeocodeResult` on success or `None` when geocoding is disabled
    or fails. Callers should treat `None` as "no coordinates available"
    and fall back to text-only logic.
    """
    if not address or not address.strip():
        return None

    client = get_redis_client()
    key = _cache_key(address)
    try:
        cached = client.get(key)
        if cached:
            try:
                lat_s, lng_s = cached.split(",")
                return GeocodeResult(lat=float(lat_s), lng=float(lng_s))
            except Exception:
                # Ignore malformed cache entries and fall through to live lookup
                pass
    except Exception:
        # Cache failures should never break geocoding
        pass

    api_key = (
        os.getenv("GOOGLE_MAPS_API_KEY")
        or os.getenv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY")
        or ""
    ).strip()
    if not api_key:
        # Geocoding is effectively disabled; do not attempt network calls.
        return None

    try:
        try:
            timeout_s = float(os.getenv("GEOCODE_TIMEOUT", "3.0") or 3.0)
        except Exception:
            timeout_s = 3.0
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {
            "address": address,
            "key": api_key,
        }
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_s, connect=1.0)
        ) as http:
            res = await http.get(url, params=params)
            res.raise_for_status()
            data = res.json()
        results = data.get("results") or []
        if not results:
            return None
        loc = (results[0].get("geometry") or {}).get("location") or {}
        lat = loc.get("lat")
        lng = loc.get("lng")
        if lat is None or lng is None:
            return None
        result = GeocodeResult(lat=float(lat), lng=float(lng))
        try:
            # Cache for 24h; addresses change rarely and can be refreshed
            # naturally by eviction or manual invalidation.
            client.setex(key, 86400, f"{result.lat},{result.lng}")
        except Exception:
            pass
        return result
    except Exception as exc:
        logger.warning("Geocoding failed for address %r: %s", address, exc)
        return None


def geocode_address(address: str) -> Optional[GeocodeResult]:
    """Sync wrapper for `geocode_address_async`.

    Intended for use in normal FastAPI sync endpoints. Falls back to `None`
    on any error instead of raising, so callers can preserve existing
    behavior when geocoding is unavailable.
    """
    if not address or not address.strip():
        return None
    try:
        import anyio

        return anyio.run(geocode_address_async, address)
    except Exception:
        # Defensive: never raise from a best-effort helper in request paths.
        return None

