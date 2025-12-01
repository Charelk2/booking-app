from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
import os
import time
import random
import logging
from collections import deque
from contextlib import contextmanager

if os.getenv("PYTEST_RUN") == "1":
    SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
else:
    SQLALCHEMY_DATABASE_URL = settings.SQLALCHEMY_DATABASE_URL

is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

# Configure engine with optional env-driven pool sizing for non-SQLite.
# Defaults are conservative and safe for most environments; tune via envs
# when running behind Cloud SQL Proxy / PgBouncer.
pool_kwargs = {
    # Avoid stale idle connections causing first-hit failures after inactivity
    "pool_pre_ping": True,
}
if is_sqlite:
    # SQLite uses a per-process connection; pass connect_args and avoid pool sizing
    connect_args = {"check_same_thread": False, "timeout": 15}
else:
    connect_args = {}
    try:
        pool_size = int(os.getenv("DB_POOL_SIZE") or 6)
        max_overflow = int(os.getenv("DB_MAX_OVERFLOW") or 6)
        pool_recycle = int(os.getenv("DB_POOL_RECYCLE") or 300)
        pool_timeout = float(os.getenv("DB_POOL_TIMEOUT") or 5.0)
        pool_kwargs.update({
            "pool_size": pool_size,
            "max_overflow": max_overflow,
            "pool_recycle": pool_recycle,
            "pool_timeout": pool_timeout,
        })
    except Exception:
        # Fall back to defaults if env parsing fails
        pool_kwargs.update({"pool_recycle": 300})

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    **pool_kwargs,
)

# Apply SQLite pragmas on every connection to reduce lock contention.
if is_sqlite:
    try:
        import sqlite3  # noqa: F401

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-redef]
            try:
                cursor = dbapi_connection.cursor()
                # WAL improves read concurrency; NORMAL reduces fsync pressure.
                cursor.execute("PRAGMA journal_mode=WAL;")
                cursor.execute("PRAGMA synchronous=NORMAL;")
                # Back off rather than instantly failing on transient locks (ms)
                cursor.execute("PRAGMA busy_timeout=60000;")
                cursor.close()
            except Exception:
                # Best-effort; never block app startup on pragmas
                try:
                    cursor.close()
                except Exception:
                    pass
    except Exception:
        # Defensive: pragma setup is optional
        pass
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency
def get_db():
    db = SessionLocal()
    # Optional pool acquire-wait telemetry sampling (off by default).
    # When enabled, sample a small fraction of requests and measure checkout
    # using a temporary engine.connect() so we don't tie up the session's
    # connection before it's actually needed.
    try:
        if os.getenv("DB_POOL_METRICS", "0").strip().lower() in {"1", "true", "yes"}:
            try:
                rate = float(os.getenv("DB_POOL_METRICS_SAMPLE", "0.05"))
            except Exception:
                rate = 0.05
            if rate > 0 and random.random() < max(0.0, min(1.0, rate)):
                _t0 = time.perf_counter()
                with engine.connect() as _conn:
                    try:
                        _conn.exec_driver_sql("SELECT 1")
                    except Exception:
                        pass
                _dt_ms = (time.perf_counter() - _t0) * 1000.0
                _record_pool_wait_ms(_dt_ms)
    except Exception:
        # Never fail request due to metrics
        pass
    try:
        yield db
    finally:
        db.close()


# ─── Pool wait metrics (best‑effort) ───────────────────────────────────────────
_POOL_LOGGER = logging.getLogger(__name__)
_POOL_SAMPLES = deque(maxlen=2000)
_POOL_COUNT = 0


def _record_pool_wait_ms(ms: float) -> None:
    global _POOL_COUNT
    try:
        _POOL_SAMPLES.append(float(ms))
        _POOL_COUNT += 1
        # Log periodically to keep overhead tiny
        if _POOL_COUNT % 200 == 0 and len(_POOL_SAMPLES) >= 50:
            vals = sorted(_POOL_SAMPLES)
            def pct(p: float) -> float:
                idx = min(len(vals) - 1, max(0, int(round(p * (len(vals) - 1)))))
                return vals[idx]
            p95 = pct(0.95)
            p99 = pct(0.99)
            p50 = pct(0.50)
            _POOL_LOGGER.info(
                "db_pool_wait_ms p50=%.1f p95=%.1f p99=%.1f n=%d",
                p50,
                p95,
                p99,
                len(vals),
            )
    except Exception:
        pass


# ─── Simple context manager for ad‑hoc DB sessions (WS, background tasks) ────
@contextmanager
def get_db_session():
    """Provide a short‑lived SessionLocal with guaranteed close.

    Use in places where FastAPI Depends is unavailable (e.g., WebSockets) to
    ensure connections are promptly returned to the pool.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        try:
            db.close()
        except Exception:
            pass
