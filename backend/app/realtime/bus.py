from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Awaitable, Callable, Optional

from app.services.redis_client import redis as _redis_client  # async redis (or null)


# Feature gate to enable/disable the realtime bus without code changes.
_WS_BUS_ENABLED = os.getenv("WS_BUS_ENABLED", "0").lower() in {"1", "true", "yes"}


def bus_enabled() -> bool:
    return _WS_BUS_ENABLED and hasattr(_redis_client, "publish")


async def publish_topic(topic: str, envelope: dict[str, Any] | str) -> None:
    """Publish an envelope to ws-topic:<topic> (JSON string or dict).

    Safe to call even when the bus is disabled; becomes a no-op.
    """
    if not bus_enabled():
        return
    try:
        data: str
        if isinstance(envelope, str):
            data = envelope
        else:
            env = dict(envelope)
            env.setdefault("v", 1)
            env.setdefault("topic", topic)
            data = json.dumps(env, separators=(",", ":"))
        await _redis_client.publish(f"ws-topic:{topic}", data)
    except Exception:
        # Best effort only; do not raise
        pass


_consumer_started = False


async def start_pattern_consumer(
    pattern: str,
    handler: Callable[[str, dict[str, Any]], Awaitable[None]],
) -> None:
    """Start a background task that PSUBSCRIBEs to a pattern and dispatches JSON payloads.

    Handler receives (topic_without_prefix, envelope_dict).
    """
    if not bus_enabled():
        return
    # Avoid starting multiple consumers for the same process
    global _consumer_started
    if _consumer_started:
        return
    _consumer_started = True

    try:
        pubsub = _redis_client.pubsub()
        await pubsub.psubscribe(pattern)

        async def _loop() -> None:
            try:
                async for msg in pubsub.listen():
                    if not isinstance(msg, dict):
                        continue
                    if msg.get("type") != "pmessage":
                        continue
                    chan = msg.get("channel")
                    data = msg.get("data")
                    try:
                        if isinstance(data, (bytes, bytearray)):
                            payload = json.loads(data.decode("utf-8"))
                        elif isinstance(data, str):
                            payload = json.loads(data)
                        else:
                            payload = {}
                    except Exception:
                        # Fallback: wrap raw
                        payload = {"payload": data.decode("utf-8") if isinstance(data, (bytes, bytearray)) else str(data)}
                    # Strip the prefix (e.g., "ws-topic:") for handler clarity
                    topic = str(chan).replace("ws-topic:", "")
                    try:
                        await handler(topic, payload)
                    except Exception:
                        # Swallow to keep the stream alive
                        pass
            finally:
                try:
                    await pubsub.close()
                except Exception:
                    pass

        asyncio.create_task(_loop())
    except Exception:
        # If pubsub subscribe fails, leave disabled; caller may retry on next startup
        _consumer_started = False
        return


__all__ = [
    "bus_enabled",
    "publish_topic",
    "start_pattern_consumer",
]

