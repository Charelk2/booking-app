#!/usr/bin/env python3
"""
Outbox worker: delivers undelivered outbox_events to thread topics via Redis.

Environment:
  - SQLALCHEMY_DATABASE_URL or DB_URL (from app config)
  - WEBSOCKET_REDIS_URL (same as API's Redis)
  - OUTBOX_POLL_INTERVAL_MS (default 1000)
  - OUTBOX_MAX_BATCH (default 200)

This worker is idempotent and safe to run alongside API instances.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

# Reuse the app's DB session factory for configuration parity
try:
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
except Exception:
    pass

from app.database import SessionLocal  # type: ignore
try:
    from app.utils.metrics import incr as metrics_incr
except Exception:  # pragma: no cover
    def metrics_incr(*args, **kwargs):  # type: ignore
        return None


async def _get_redis():
    url = os.getenv("WEBSOCKET_REDIS_URL")
    if not url:
        return None
    try:
        from redis import asyncio as aioredis  # type: ignore
    except Exception:
        return None
    return aioredis.from_url(url, health_check_interval=30, retry_on_timeout=True, socket_keepalive=True, socket_timeout=5)


async def publish(redis, channel: str, payload: dict[str, Any]) -> bool:
    if not redis:
        return False
    try:
        data = json.dumps(payload, separators=(",", ":"))
        await redis.publish(channel, data)
        return True
    except Exception:
        return False


def _now_tz() -> datetime:
    return datetime.now(timezone.utc)


async def run_once(max_batch: int = 200) -> int:
    delivered = 0
    async_redis = await _get_redis()
    if async_redis is None:
        # Without Redis, there is nothing to deliver
        return 0
    db = SessionLocal()
    try:
        rows = db.execute(
            text(
                """
                SELECT id, topic, payload_json
                FROM outbox_events
                WHERE delivered_at IS NULL
                  AND (due_at IS NULL OR due_at <= CURRENT_TIMESTAMP)
                ORDER BY created_at ASC
                LIMIT :lim
                """
            ),
            {"lim": max_batch},
        ).fetchall()
        for rid, topic, payload_json in rows:
            # Derive thread id from topic 'booking-requests:<id>'
            try:
                if not isinstance(topic, str) or ":" not in topic:
                    continue
                _, id_str = topic.split(":", 1)
                thread_id = int(id_str)
            except Exception:
                continue
            try:
                payload = json.loads(payload_json)
            except Exception:
                payload = {"_error": "invalid-payload"}
            ok = await publish(async_redis, f"ws:{thread_id}", payload)
            if ok:
                db.execute(text("UPDATE outbox_events SET delivered_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": rid})
                db.commit()
                try:
                    print(f"outbox_delivered id={int(rid)} topic={topic} thread={thread_id}")
                except Exception:
                    pass
                try:
                    metrics_incr("outbox.delivered_total")
                except Exception:
                    pass
                delivered += 1
            else:
                # Retry with backoff
                db.execute(
                    text(
                        "UPDATE outbox_events SET attempt_count = attempt_count + 1, last_error = :err, due_at = CURRENT_TIMESTAMP + INTERVAL '5 seconds' WHERE id = :id"
                    ),
                    {"id": rid, "err": "publish_failed"},
                )
                db.commit()
                try:
                    print(f"outbox_attempt_failed id={int(rid)} topic={topic} thread={thread_id}")
                except Exception:
                    pass
                try:
                    metrics_incr("outbox.attempt_failed_total")
                except Exception:
                    pass
    finally:
        try:
            db.close()
        except Exception:
            pass
    try:
        if async_redis:
            try:
                await async_redis.aclose()  # redis-py 5.x async close
            except Exception:
                # Fallback for older redis versions
                try:
                    await async_redis.close()  # type: ignore[attr-defined]
                except Exception:
                    pass
    except Exception:
        pass
    return delivered


async def main() -> None:
    interval_ms = int(os.getenv("OUTBOX_POLL_INTERVAL_MS") or 1000)
    max_batch = int(os.getenv("OUTBOX_MAX_BATCH") or 200)
    last_lag_log = 0.0
    while True:
        try:
            await run_once(max_batch=max_batch)
        except Exception:
            # Keep going; the loop is resilient
            pass
        # Periodic lag metric: count undelivered and oldest age
        try:
            now = asyncio.get_running_loop().time()
            if now - last_lag_log >= 10.0:  # every ~10s
                db = SessionLocal()
                try:
                    row = db.execute(text(
                        """
                        SELECT COUNT(*) AS cnt,
                               EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(created_at))) AS age_s
                        FROM outbox_events
                        WHERE delivered_at IS NULL
                          AND (due_at IS NULL OR due_at <= CURRENT_TIMESTAMP)
                        """
                    )).first()
                    cnt = int(row[0] or 0) if row is not None else 0
                    age = float(row[1] or 0.0) if row is not None else 0.0
                    # Lightweight log line; apps can grep for 'outbox_lag'
                    print(f"outbox_lag count={cnt} oldest_s={age:.1f}")
                except Exception:
                    pass
                finally:
                    try:
                        db.close()
                    except Exception:
                        pass
                last_lag_log = now
        except Exception:
            # do not break the loop if lag metric fails
            pass
        await asyncio.sleep(interval_ms / 1000.0)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
