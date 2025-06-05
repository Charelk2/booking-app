import sqlite3
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.db_utils import ensure_notification_link_column


def setup_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE notifications (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    type VARCHAR,
                    message VARCHAR,
                    is_read BOOLEAN,
                    timestamp DATETIME
                )
                """
            )
        )
    return engine


def test_add_link_column():
    engine = setup_engine()
    ensure_notification_link_column(engine)
    inspector = inspect(engine)
    column_names = [col["name"] for col in inspector.get_columns("notifications")]
    assert "link" in column_names
