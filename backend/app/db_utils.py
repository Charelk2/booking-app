from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_service_type_column(engine: Engine) -> None:
    """Ensure the service_type column exists on the services table.

    Older SQLite databases created before the ServiceType enum was added will
    be missing this column. This helper adds it with a sensible default so
    queries referencing ``Service.service_type`` don't fail.
    """
    inspector = inspect(engine)
    if "services" not in inspector.get_table_names():
        return
    column_names = [col["name"] for col in inspector.get_columns("services")]
    if "service_type" not in column_names:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE services ADD COLUMN service_type VARCHAR NOT NULL DEFAULT 'Live Performance'"
                )
            )
            conn.commit()


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
            conn.execute(text("ALTER TABLE messages ADD COLUMN attachment_url VARCHAR"))
            conn.commit()


def ensure_display_order_column(engine: Engine) -> None:
    """Add the display_order column to services if it's missing."""
    inspector = inspect(engine)
    if "services" not in inspector.get_table_names():
        return
    column_names = [col["name"] for col in inspector.get_columns("services")]
    if "display_order" not in column_names:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE services ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0"
                )
            )
            conn.commit()


def ensure_notification_link_column(engine: Engine) -> None:
    """Add the link column to notifications if it's missing."""
    inspector = inspect(engine)
    if "notifications" not in inspector.get_table_names():
        return
    column_names = [col["name"] for col in inspector.get_columns("notifications")]
    if "link" not in column_names:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE notifications ADD COLUMN link VARCHAR NOT NULL DEFAULT ''"
                )
            )
            conn.commit()
