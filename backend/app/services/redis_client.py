from redis.asyncio import from_url

from app.core.config import REDIS_URL

redis = from_url(REDIS_URL, decode_responses=True)

__all__ = ["redis"]
