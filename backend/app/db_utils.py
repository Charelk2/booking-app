from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_message_type_column(engine: Engine) -> None:
    """Add the message_type column if it's missing (for SQLite databases)."""
    inspector = inspect(engine)
    if "messages" not in inspector.get_table_names():
        return
    column_names = [col["name"] for col in inspector.get_columns("messages")]
    if "message_type" not in column_names:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE messages ADD COLUMN message_type VARCHAR NOT NULL DEFAULT 'text'"
                )
            )
            conn.commit()


def ensure_attachment_url_column(engine: Engine) -> None:
    """Add the attachment_url column if missing."""
    inspector = inspect(engine)
    if "messages" not in inspector.get_table_names():
        return
    column_names = [col["name"] for col in inspector.get_columns("messages")]
    if "attachment_url" not in column_names:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE messages ADD COLUMN attachment_url VARCHAR"
                )
            )
            conn.commit()
