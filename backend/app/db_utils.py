from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def add_column_if_missing(engine: Engine, table: str, column: str, ddl: str) -> None:
    """Add a column to *table* if it does not exist."""

    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return
    column_names = [col["name"] for col in inspector.get_columns(table)]
    if column not in column_names:
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
            conn.commit()


def ensure_service_type_column(engine: Engine) -> None:
    """Ensure the ``service_type`` column exists on the ``services`` table."""

    add_column_if_missing(
        engine,
        "services",
        "service_type",
        "service_type VARCHAR NOT NULL DEFAULT 'Live Performance'",
    )


def ensure_message_type_column(engine: Engine) -> None:
    """Add the ``message_type`` column if it's missing."""

    add_column_if_missing(
        engine,
        "messages",
        "message_type",
        "message_type VARCHAR NOT NULL DEFAULT 'text'",
    )


def ensure_attachment_url_column(engine: Engine) -> None:
    """Add the ``attachment_url`` column if it's missing."""

    add_column_if_missing(
        engine,
        "messages",
        "attachment_url",
        "attachment_url VARCHAR",
    )


def ensure_request_attachment_column(engine: Engine) -> None:
    """Add the ``attachment_url`` column to ``booking_requests`` if missing."""

    add_column_if_missing(
        engine,
        "booking_requests",
        "attachment_url",
        "attachment_url VARCHAR",
    )


def ensure_display_order_column(engine: Engine) -> None:
    """Add the ``display_order`` column to ``services`` if it's missing."""

    add_column_if_missing(
        engine,
        "services",
        "display_order",
        "display_order INTEGER NOT NULL DEFAULT 0",
    )


def ensure_notification_link_column(engine: Engine) -> None:
    """Add the ``link`` column to ``notifications`` if it's missing."""

    add_column_if_missing(
        engine,
        "notifications",
        "link",
        "link VARCHAR NOT NULL DEFAULT ''",
    )


def ensure_custom_subtitle_column(engine: Engine) -> None:
    """Add the ``custom_subtitle`` column to ``artist_profiles`` if it's missing."""

    add_column_if_missing(
        engine,
        "artist_profiles",
        "custom_subtitle",
        "custom_subtitle VARCHAR",
    )


def ensure_price_visible_column(engine: Engine) -> None:
    """Add the ``price_visible`` column to ``artist_profiles`` if it's missing."""

    add_column_if_missing(
        engine,
        "artist_profiles",
        "price_visible",
        "price_visible BOOLEAN NOT NULL DEFAULT TRUE",
    )


def ensure_currency_column(engine: Engine) -> None:
    """Add the ``currency`` column to ``services`` if it's missing."""

    add_column_if_missing(
        engine,
        "services",
        "currency",
        "currency VARCHAR(3) NOT NULL DEFAULT 'ZAR'",
    )


def ensure_booking_simple_columns(engine: Engine) -> None:
    """Add missing ``date`` and ``location`` columns on ``bookings_simple``."""

    add_column_if_missing(engine, "bookings_simple", "date", "date DATETIME")
    add_column_if_missing(engine, "bookings_simple", "location", "location VARCHAR")
