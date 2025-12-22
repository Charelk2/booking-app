import json
import logging
import random
import base64
from datetime import date
from typing import List, Optional, Any, Iterable

import redis
import os

from app.core.config import settings
from .json_utils import dumps

_redis_client: Optional[redis.Redis] = None


class _NullRedis:
    """No-op Redis client used when Redis is disabled or unavailable.

    Methods mirror the minimal surface used in this codebase so callers can
    proceed without needing try/except around get_redis_client().
    """

    def get(self, key: str):
        return None

    def setex(self, key: str, expire: int, value: str):
        return None

    def scan_iter(self, pattern: str):
        return iter(())

    def delete(self, key: str):
        return 0

    def close(self):
        return None


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        url = (getattr(settings, "REDIS_URL", "") or "").strip()
        # Allow disabling via empty/none/disabled/false
        if not url or url.lower() in {"none", "disabled", "false", "0"}:
            _redis_client = _NullRedis()  # type: ignore[assignment]
            return _redis_client
        try:
            # Apply conservative socket timeouts so slow Redis does not
            # significantly impact auth/login paths that consult counters.
            try:
                conn_to = float(os.getenv("REDIS_CONNECT_TIMEOUT", "0.5"))
            except Exception:
                conn_to = 0.5
            try:
                read_to = float(os.getenv("REDIS_SOCKET_TIMEOUT", "0.5"))
            except Exception:
                read_to = 0.5
            _redis_client = redis.from_url(
                url,
                decode_responses=True,
                socket_connect_timeout=conn_to,
                socket_timeout=read_to,
            )
        except Exception:
            # Fall back to no-op client if creation fails
            _redis_client = _NullRedis()  # type: ignore[assignment]
    return _redis_client


# Convenience aliases used by various modules
def get_redis() -> redis.Redis:
    return get_redis_client()


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
    except redis.exceptions.RedisError as exc:
        logging.warning("Redis unavailable: %s", exc)
        return None
    if not data:
        return None
    try:
        return json.loads(data)
    except Exception as exc:
        # Defensive: treat malformed payloads as cache misses instead of 500s.
        logging.warning("Could not decode artist list cache for key %s: %s", key, exc)
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
    except redis.exceptions.RedisError as exc:
        logging.warning("Could not cache artist list: %s", exc)
    return None


def invalidate_artist_list_cache() -> None:
    """Remove all cached artist list entries."""
    client = get_redis_client()
    try:
        for key in client.scan_iter(f"{ARTIST_LIST_KEY_PREFIX}:*"):
            client.delete(key)
    except redis.exceptions.RedisError as exc:
        logging.warning("Could not clear artist list cache: %s", exc)
    return None


# ─── BYTE CACHE HELPERS (store as base64 on text client) ───────────────────────────
def cache_bytes(key: str, data: bytes, expire: int) -> None:
    """Cache arbitrary bytes under the given key using base64 encoding.

    The global Redis client is configured with decode_responses=True, so we
    encode binary blobs as base64 strings for storage.
    """
    client = get_redis_client()
    try:
        b64 = base64.b64encode(data).decode("ascii")
        client.setex(key, expire, b64)
    except redis.exceptions.RedisError as exc:
        logging.warning("Could not cache bytes: %s", exc)


def get_cached_bytes(key: str) -> Optional[bytes]:
    """Return cached bytes for the key if present, else None."""
    client = get_redis_client()
    try:
        data = client.get(key)
    except redis.exceptions.RedisError as exc:
        logging.warning("Redis unavailable: %s", exc)
        return None
    if not data:
        return None
    try:
        return base64.b64decode(data)
    except Exception:
        return None



def _weather_key(location: str) -> str:
    return f"{WEATHER_KEY_PREFIX}:{location.lower()}"


def get_cached_weather(location: str) -> dict | None:
    client = get_redis_client()
    key = _weather_key(location)
    try:
        data = client.get(key)
    except redis.exceptions.RedisError as exc:
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
    except redis.exceptions.RedisError as exc:
        logging.warning("Could not cache weather: %s", exc)
    return None


def _availability_key(artist_id: int, when: Optional[date]) -> str:
    day = when.isoformat() if when else "all"
    return f"{AVAILABILITY_KEY_PREFIX}:{artist_id}:{day}"


# ─── PREVIEW CACHE INVALIDATION ───────────────────────────────────────────────
def invalidate_preview_cache_for_user(user_id: int, role: Optional[str] = None, limit: Optional[int] = None) -> int:
    """Delete cached preview entries for a user.

    Keys are of the form: preview:{user_id}:{role}:{limit}:{suffix}
    where role ∈ {artist, client} and suffix ∈ {etag, body}.

    When role/limit are omitted, all roles/limits for the user are cleared.

    Returns the number of keys deleted (best‑effort; 0 on Redis unavailability).
    """
    client = get_redis_client()
    try:
        r = (role or "*").strip()
        l = str(limit) if limit is not None else "*"
        pattern = f"preview:{int(user_id)}:{r}:{l}:*"
        deleted = 0
        for key in client.scan_iter(pattern):
            try:
                deleted += int(client.delete(key) or 0)
            except Exception:
                continue
        return deleted
    except Exception:
        return 0


def invalidate_preview_cache_for_users(user_ids: Iterable[int]) -> int:
    """Delete cached preview entries for multiple users. Returns total keys deleted."""
    total = 0
    for uid in user_ids:
        try:
            total += invalidate_preview_cache_for_user(int(uid))
        except Exception:
            continue
    return total


def get_cached_availability(
    artist_id: int, when: Optional[date] = None
) -> dict | None:
    client = get_redis_client()
    key = _availability_key(artist_id, when)
    try:
        data = client.get(key)
    except redis.exceptions.RedisError as exc:
        logging.warning("Redis unavailable: %s", exc)
        return None
    if not data:
        return None
    try:
        return json.loads(data)
    except Exception as exc:
        # Defensive: if the cached value is corrupted or not valid JSON,
        # fall back to a cache miss so availability lookups never 500.
        logging.warning("Could not decode availability cache for key %s: %s", key, exc)
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
    except redis.exceptions.RedisError as exc:
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
    except redis.exceptions.RedisError as exc:
        logging.warning("Could not clear availability cache: %s", exc)
    return None


def close_redis_client() -> None:
    """Close the global Redis client if it exists."""
    global _redis_client
    if _redis_client is not None:
        try:
            _redis_client.close()
        except redis.exceptions.RedisError as exc:  # pragma: no cover - best effort
            logging.warning("Error closing Redis client: %s", exc)
        finally:
            _redis_client = None
