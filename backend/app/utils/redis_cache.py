import json
import redis
from typing import Any, List
import logging
from app.core.config import settings
from .json_utils import dumps

_redis_client = None


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


ARTIST_LIST_KEY = "artist_profiles:list"


def get_cached_artist_list() -> List[dict] | None:
    client = get_redis_client()
    try:
        data = client.get(ARTIST_LIST_KEY)
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Redis unavailable: %s", exc)
        return None
    if data:
        return json.loads(data)
    return None


def cache_artist_list(data: List[dict], expire: int = 60) -> None:
    client = get_redis_client()
    try:
        client.setex(ARTIST_LIST_KEY, expire, dumps(data))
    except redis.exceptions.ConnectionError as exc:
        logging.warning("Could not cache artist list: %s", exc)
