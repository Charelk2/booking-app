from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
import os

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
        pool_size = int(os.getenv("DB_POOL_SIZE") or 5)
        max_overflow = int(os.getenv("DB_MAX_OVERFLOW") or 10)
        pool_recycle = int(os.getenv("DB_POOL_RECYCLE") or 300)
        pool_kwargs.update({
            "pool_size": pool_size,
            "max_overflow": max_overflow,
            "pool_recycle": pool_recycle,
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
    try:
        yield db
    finally:
        db.close()
