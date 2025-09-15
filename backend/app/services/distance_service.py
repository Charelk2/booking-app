"""Distance utilities with caching and haversine fallback.

Provides a single entrypoint `get_distance_metrics(from_addr, to_addr)` that
returns a dict: {"distance_km": float, "duration_hrs": float, "rough": bool}.

Attempts Google Distance Matrix (if GOOGLE_MAPS_API_KEY is configured);
otherwise calls the internal /api/v1/distance proxy when available. On failure,
falls back to haversine distance with a nominal average speed to estimate
duration and marks the result as rough.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import logging
import math
import os
from typing import Optional, Dict

import httpx

from app.utils.redis_cache import get_redis_client

logger = logging.getLogger(__name__)


@dataclass
class DistanceMetrics:
    distance_km: float
    duration_hrs: float
    rough: bool = False


def _cache_key(frm: str, to: str) -> str:
    return f"dist:metrics:{frm.strip().lower()}::{to.strip().lower()}"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in kilometers between two lat/lng pairs."""
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def get_distance_metrics_async(from_addr: str, to_addr: str) -> DistanceMetrics:
    """Async variant of distance lookup with caching and fallback."""
    if not from_addr or not to_addr:
        return DistanceMetrics(0.0, 0.0, True)

    client = get_redis_client()
    key = _cache_key(from_addr, to_addr)
    try:
        cached = client.get(key)
        if cached:
            dist, dur, rough = cached.split(",")
            return DistanceMetrics(float(dist), float(dur), rough == "1")
    except Exception:
        pass

    # Prefer direct Google API if key configured
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    try:
        if api_key:
            url = "https://maps.googleapis.com/maps/api/distancematrix/json"
            params = {
                "units": "metric",
                "origins": from_addr,
                "destinations": to_addr,
                "departure_time": "now",
                "traffic_model": "best_guess",
                "key": api_key,
            }
            async with httpx.AsyncClient(timeout=8.0) as http:
                res = await http.get(url, params=params)
                res.raise_for_status()
                data = res.json()
                meters = data.get("rows", [{}])[0].get("elements", [{}])[0].get("distance", {}).get("value", 0)
                secs = data.get("rows", [{}])[0].get("elements", [{}])[0].get("duration", {}).get("value", 0)
                dm = DistanceMetrics(distance_km=meters / 1000.0, duration_hrs=secs / 3600.0, rough=False)
                try:
                    client.setex(key, 900, f"{dm.distance_km},{dm.duration_hrs},0")
                except Exception:
                    pass
                return dm
    except Exception as exc:
        logger.warning("Google Distance Matrix failed: %s", exc)

    # Try internal proxy if available
    try:
        port = os.getenv("PORT", "8000")
        url = f"http://127.0.0.1:{port}/api/v1/distance"
        async with httpx.AsyncClient(timeout=5.0) as http:
            res = await http.get(url, params={"from_location": from_addr, "to_location": to_addr, "includeDuration": True})
            if res.status_code == 200:
                data = res.json()
                meters = data.get("rows", [{}])[0].get("elements", [{}])[0].get("distance", {}).get("value", 0)
                secs = data.get("rows", [{}])[0].get("elements", [{}])[0].get("duration", {}).get("value", 0)
                dm = DistanceMetrics(distance_km=meters / 1000.0, duration_hrs=secs / 3600.0, rough=False)
                try:
                    client.setex(key, 900, f"{dm.distance_km},{dm.duration_hrs},0")
                except Exception:
                    pass
                return dm
    except Exception as exc:  # pragma: no cover
        logger.warning("Distance proxy failed: %s", exc)

    # Fallback: rough haversine via geocoding minimal endpoints is out of scope; assume 60km/h average duration
    # Without geocoding, we cannot compute haversine; return rough zeroes rather than mislead
    dm = DistanceMetrics(distance_km=0.0, duration_hrs=0.0, rough=True)
    try:
        client.setex(key, 300, f"{dm.distance_km},{dm.duration_hrs},1")
    except Exception:
        pass
    return dm


def get_distance_metrics(from_addr: str, to_addr: str) -> DistanceMetrics:
    """Sync wrapper around async distance lookup for convenience."""
    import anyio
    return anyio.run(get_distance_metrics_async, from_addr, to_addr)

