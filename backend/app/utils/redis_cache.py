import json
import logging
import random
from datetime import date
from typing import List, Optional, Any

import redis

from app.core.config import settings
from .json_utils import dumps

_redis_client: Optional[redis.Redis] = None


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


ARTIST_LIST_KEY_PREFIX = "service_provider_profiles:list"
WEATHER_KEY_PREFIX = "weather:3day"
AVAILABILITY_KEY_PREFIX = "availability"


def _apply_jitter(expire: int) -> int:
    """Return a TTL with a small random jitter to prevent cache stampedes."""
    return expire + random.randint(0, max(1, expire // 10))


def _make_key(
    page: int,
    limit: int,
    category: Optional[str],
    location: Optional[str],
    sort: Optional[str],
    min_price: Optional[float],
    max_price: Optional[float],
    fields: Optional[str] = None,
) -> str:
    """Return a Redis key for the given parameter combination.

    Includes ``fields`` so that trimmed payload variants don't collide with
    full payload caches. The ``fields`` string is normalized to a sorted,
    comma-separated list for key stability.
    """
    cat = (category or "").strip()
    loc = (location or "").strip()
    srt = (sort or "").strip()
    minp = "" if min_price is None else str(min_price)
    maxp = "" if max_price is None else str(max_price)
    fld = ""
    if fields:
        try:
            parts = [p.strip() for p in fields.split(",") if p.strip()]
            parts.sort()
            fld = ",".join(parts)
        except Exception:
            fld = (fields or "").strip()
    return f"{ARTIST_LIST_KEY_PREFIX}:{page}:{limit}:{cat}:{loc}:{srt}:{minp}:{maxp}:{fld}"


def get_cached_artist_list(
    page: int = 1,
    *,
    limit: int = 20,
    category: Optional[str] = None,
    location: Optional[str] = None,
    sort: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    fields: Optional[str] = None,
) -> Any | None:
    """Retrieve a cached artist page (data or payload) for the given parameters if available."""
    client = get_redis_client()
    key = _make_key(page, limit, category, location, sort, min_price, max_price, fields)
    try:
        data = client.get(key)
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Redis unavailable: %s", exc)
        return None
    if data:
        return json.loads(data)
    return None


def cache_artist_list(
    data: Any,
    page: int = 1,
    *,
    limit: int = 20,
    category: Optional[str] = None,
    location: Optional[str] = None,
    sort: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    expire: int = 60,
    fields: Optional[str] = None,
) -> None:
    """Cache the artist page payload for the given parameter combination."""
    client = get_redis_client()
    key = _make_key(page, limit, category, location, sort, min_price, max_price, fields)
    try:
        client.setex(key, expire, dumps(data))
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Could not cache artist list: %s", exc)
    return None


def invalidate_artist_list_cache() -> None:
    """Remove all cached artist list entries."""
    client = get_redis_client()
    try:
        for key in client.scan_iter(f"{ARTIST_LIST_KEY_PREFIX}:*"):
            client.delete(key)
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Could not clear artist list cache: %s", exc)
    return None



def _weather_key(location: str) -> str:
    return f"{WEATHER_KEY_PREFIX}:{location.lower()}"


def get_cached_weather(location: str) -> dict | None:
    client = get_redis_client()
    key = _weather_key(location)
    try:
        data = client.get(key)
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Redis unavailable: %s", exc)
        return None
    if data:
        return json.loads(data)
    return None


def cache_weather(data: dict, location: str, expire: int = 1800) -> None:
    client = get_redis_client()
    key = _weather_key(location)
    ttl = _apply_jitter(expire)
    try:
        client.setex(key, ttl, dumps(data))
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Could not cache weather: %s", exc)
    return None


def _availability_key(artist_id: int, when: Optional[date]) -> str:
    day = when.isoformat() if when else "all"
    return f"{AVAILABILITY_KEY_PREFIX}:{artist_id}:{day}"


def get_cached_availability(
    artist_id: int, when: Optional[date] = None
) -> dict | None:
    client = get_redis_client()
    key = _availability_key(artist_id, when)
    try:
        data = client.get(key)
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Redis unavailable: %s", exc)
        return None
    if data:
        return json.loads(data)
    return None


def cache_availability(
    data: dict,
    artist_id: int,
    when: Optional[date] = None,
    expire: int = 300,
) -> None:
    client = get_redis_client()
    key = _availability_key(artist_id, when)
    ttl = _apply_jitter(expire)
    try:
        client.setex(key, ttl, dumps(data))
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Could not cache availability: %s", exc)
    return None


def invalidate_availability_cache(
    artist_id: int, when: Optional[date] = None
) -> None:
    client = get_redis_client()
    try:
        if when is None:
            pattern = f"{AVAILABILITY_KEY_PREFIX}:{artist_id}:*"
            for key in client.scan_iter(pattern):
                client.delete(key)
        else:
            client.delete(_availability_key(artist_id, when))
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Could not clear availability cache: %s", exc)
    return None


def close_redis_client() -> None:
    """Close the global Redis client if it exists."""
    global _redis_client
    if _redis_client is not None:
        try:
            _redis_client.close()
        except redis.exceptions.ConnectionError as exc:  # pragma: no cover - best effort
            logging.warning("Error closing Redis client: %s", exc)
        finally:
            _redis_client = None
