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


def ensure_message_is_read_column(engine: Engine) -> None:
    """Add the ``is_read`` column to ``messages`` if missing."""

    add_column_if_missing(
        engine,
        "messages",
        "is_read",
        "is_read BOOLEAN NOT NULL DEFAULT FALSE",
    )


def ensure_visible_to_column(engine: Engine) -> None:
    """Add the ``visible_to`` column to ``messages`` if missing."""

    add_column_if_missing(
        engine,
        "messages",
        "visible_to",
        "visible_to VARCHAR NOT NULL DEFAULT 'both'",
    )


def ensure_message_action_column(engine: Engine) -> None:
    """Add the ``action`` column to ``messages`` if missing."""

    add_column_if_missing(
        engine,
        "messages",
        "action",
        "action VARCHAR",
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


def ensure_portfolio_image_urls_column(engine: Engine) -> None:
    """Add the ``portfolio_image_urls`` column to ``artist_profiles`` if missing."""

    add_column_if_missing(
        engine,
        "artist_profiles",
        "portfolio_image_urls",
        "portfolio_image_urls JSON",
    )


def ensure_currency_column(engine: Engine) -> None:
    """Add the ``currency`` column to ``services`` if it's missing."""

    add_column_if_missing(
        engine,
        "services",
        "currency",
        "currency VARCHAR(3) NOT NULL DEFAULT 'ZAR'",
    )


def ensure_service_travel_columns(engine: Engine) -> None:
    """Add travel-related columns to ``services`` if missing."""

    add_column_if_missing(
        engine,
        "services",
        "travel_rate",
        "travel_rate NUMERIC(10, 2)",
    )
    add_column_if_missing(
        engine,
        "services",
        "travel_members",
        "travel_members INTEGER",
    )


def ensure_booking_simple_columns(engine: Engine) -> None:
    """Add missing columns on ``bookings_simple``."""

    add_column_if_missing(
        engine,
        "bookings_simple",
        "date",
        "date DATETIME",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "location",
        "location VARCHAR",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "payment_status",
        "payment_status VARCHAR NOT NULL DEFAULT 'pending'",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "payment_id",
        "payment_id VARCHAR",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "deposit_amount",
        "deposit_amount NUMERIC(10, 2)"
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "deposit_due_by",
        "deposit_due_by DATETIME"
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "deposit_paid",
        "deposit_paid BOOLEAN NOT NULL DEFAULT FALSE",
    )


def ensure_mfa_columns(engine: Engine) -> None:
    """Add MFA fields to the ``users`` table if missing."""
    add_column_if_missing(
        engine,
        "users",
        "mfa_secret",
        "mfa_secret VARCHAR"
    )
    add_column_if_missing(
        engine,
        "users",
        "mfa_enabled",
        "mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE"
    )
    add_column_if_missing(
        engine,
        "users",
        "mfa_recovery_tokens",
        "mfa_recovery_tokens TEXT"
    )


def ensure_calendar_account_email_column(engine: Engine) -> None:
    """Add the ``email`` column to ``calendar_accounts`` if it's missing."""

    add_column_if_missing(
        engine,
        "calendar_accounts",
        "email",
        "email VARCHAR",
    )


def ensure_user_profile_picture_column(engine: Engine) -> None:
    """Add the ``profile_picture_url`` column to ``users`` if it's missing."""

    add_column_if_missing(
        engine,
        "users",
        "profile_picture_url",
        "profile_picture_url VARCHAR",
    )


def ensure_booking_request_travel_columns(engine: Engine) -> None:
    """Add travel-related columns to ``booking_requests`` if missing."""

    add_column_if_missing(
        engine,
        "booking_requests",
        "travel_mode",
        "travel_mode VARCHAR",
    )
    add_column_if_missing(
        engine,
        "booking_requests",
        "travel_cost",
        "travel_cost NUMERIC(10, 2)",
    )
    add_column_if_missing(
        engine,
        "booking_requests",
        "travel_breakdown",
        "travel_breakdown JSON",
    )

