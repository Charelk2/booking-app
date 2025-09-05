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

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 15} if is_sqlite else {},
    # Avoid stale idle connections causing first-hit failures after inactivity
    pool_pre_ping=True,
    # Recycle connections periodically to play well with proxies like pgbouncer/LB
    pool_recycle=300,
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
