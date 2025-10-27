from typing import Any

try:
    from redis import asyncio as aioredis  # type: ignore
except Exception:  # pragma: no cover
    aioredis = None  # type: ignore

from app.core.config import REDIS_URL


class _AsyncNullRedis:
    async def setex(self, *args: Any, **kwargs: Any) -> None:  # pragma: no cover - no-op
        return None

    async def get(self, *args: Any, **kwargs: Any) -> None:  # pragma: no cover - no-op
        return None

    async def delete(self, *args: Any, **kwargs: Any) -> None:  # pragma: no cover - no-op
        return None


def _build_client() -> Any:
    url = (REDIS_URL or "").strip()
    if not aioredis or not url or not url.lower().startswith(("redis://", "rediss://")):
        return _AsyncNullRedis()
    try:
        return aioredis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=5,
            health_check_interval=30,
            retry_on_timeout=True,
        )
    except Exception:
        return _AsyncNullRedis()


redis = _build_client()

__all__ = ["redis"]
