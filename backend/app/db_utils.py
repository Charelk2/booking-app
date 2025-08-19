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


def ensure_legacy_artist_user_type(engine: Engine) -> None:
    """Normalize legacy ``ARTIST`` user types to ``SERVICE_PROVIDER``.

    Older databases stored ``user_type`` as ``ARTIST`` before the role was
    renamed to ``SERVICE_PROVIDER``. This helper updates any remaining rows so
    that existing artists can authenticate without enum errors.
    """

    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    with engine.connect() as conn:
        conn.execute(
            text(
                "UPDATE users SET user_type='SERVICE_PROVIDER' "
                "WHERE user_type='ARTIST'"
            )
        )
        conn.commit()


def ensure_service_category_id_column(engine: Engine) -> None:
    """Ensure ``services`` table supports service categories.

    Historically the ``service_category_id`` and ``details`` fields were
    introduced after some databases were already in use. This helper mirrors
    the Alembic migration by adding the columns to ``services`` when they are
    missing. It allows deployments that have not run migrations to function
    without SQL errors.
    """

    # ``services`` received a ``service_category_id`` foreign key and an
    # optional JSON ``details`` column for category specific data.  Ensure both
    # columns exist to keep ORM queries in sync with the database schema.
    add_column_if_missing(
        engine,
        "services",
        "service_category_id",
        "service_category_id INTEGER",
    )
    add_column_if_missing(
        engine,
        "services",
        "details",
        "details JSON",
    )


def seed_service_categories(engine: Engine) -> None:
    """Create and seed the ``service_categories`` table if absent."""

    inspector = inspect(engine)
    from datetime import datetime
    from sqlalchemy import (
        Table,
        MetaData,
        Integer,
        String,
        Column,
        DateTime,
        select,
    )

    # Canonical list of service categories that should exist in the database.
    categories = [
        "Musician",
        "DJ",
        "Photographer",
        "Videographer",
        "Speaker",
        "Sound Service",
        "Wedding Venue",
        "Caterer",
        "Bartender",
        "MC & Host",
    ]

    if "service_categories" not in inspector.get_table_names():
        metadata = MetaData()
        table = Table(
            "service_categories",
            metadata,
            Column("id", Integer, primary_key=True),
            Column("name", String, unique=True, nullable=False),
            Column("created_at", DateTime, default=datetime.utcnow),
            Column("updated_at", DateTime, default=datetime.utcnow),
        )
        metadata.create_all(engine)
    else:
        metadata = MetaData()
        table = Table("service_categories", metadata, autoload_with=engine)

    # Upsert categories to keep the table in sync with the canonical list.
    with engine.begin() as conn:
        existing = {row.name for row in conn.execute(select(table.c.name))}

        # Insert any missing categories.
        for name in categories:
            if name not in existing:
                conn.execute(
                    table.insert().values(
                        name=name,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    )
                )

        # Remove categories that are no longer part of the canonical list.
        obsolete = [name for name in existing if name not in categories]
        if obsolete:
            conn.execute(table.delete().where(table.c.name.in_(obsolete)))


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


def normalize_message_type_values(engine: Engine) -> None:
    """Normalize legacy/lowercase message_type values to uppercase enums.

    Ensures values like 'text', 'user', 'quote', 'system' are converted to
    'USER', 'QUOTE', or 'SYSTEM'. 'TEXT' is normalized to 'USER' to match
    current semantics.
    """
    inspector = inspect(engine)
    if "messages" not in inspector.get_table_names():
        return
    with engine.connect() as conn:
        try:
            conn.execute(text("UPDATE messages SET message_type='USER' WHERE lower(message_type)='text'"))
            conn.execute(text("UPDATE messages SET message_type=upper(message_type)"))
            conn.commit()
        except Exception:
            # Best-effort; don't block app startup if normalization fails
            conn.rollback()


def ensure_message_core_columns(engine: Engine) -> None:
    """Ensure core columns on messages required by the chat API exist.

    This covers deployments that started with a minimal messages table created
    by earlier safe migrations. The chat endpoints require these fields:
    - booking_request_id INTEGER
    - sender_id INTEGER
    - sender_type VARCHAR (client|artist)
    - content TEXT
    - timestamp DATETIME
    - quote_id INTEGER (optional, for quote messages)
    """
    add_column_if_missing(
        engine,
        "messages",
        "booking_request_id",
        "booking_request_id INTEGER",
    )
    add_column_if_missing(
        engine,
        "messages",
        "sender_id",
        "sender_id INTEGER",
    )
    add_column_if_missing(
        engine,
        "messages",
        "sender_type",
        "sender_type VARCHAR",
    )
    add_column_if_missing(
        engine,
        "messages",
        "content",
        "content TEXT NOT NULL DEFAULT ''",
    )
    add_column_if_missing(
        engine,
        "messages",
        "timestamp",
        "timestamp DATETIME",
    )
    add_column_if_missing(
        engine,
        "messages",
        "quote_id",
        "quote_id INTEGER",
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


def ensure_message_expires_at_column(engine: Engine) -> None:
    """Add the ``expires_at`` column to ``messages`` if missing."""

    add_column_if_missing(
        engine,
        "messages",
        "expires_at",
        "expires_at DATETIME",
    )


def ensure_message_system_key_column(engine: Engine) -> None:
    """Add the ``system_key`` column to ``messages`` if missing.

    Used to dedupe system messages by a deterministic key (e.g., booking-details).
    """
    add_column_if_missing(
        engine,
        "messages",
        "system_key",
        "system_key VARCHAR",
    )


def cleanup_blank_messages(engine: Engine) -> int:
    """Delete legacy blank messages to keep threads clean.

    Removes rows where content is NULL or only whitespace and there is no
    attachment_url. This preserves attachment-only messages while removing
    truly empty entries that rendered as blank bubbles in the UI.
    Returns the number of rows deleted (best-effort; 0 if table missing).
    """
    inspector = inspect(engine)
    if "messages" not in inspector.get_table_names():
        return 0
    with engine.connect() as conn:
        try:
            res = conn.execute(
                text(
                    """
                    DELETE FROM messages
                    WHERE (content IS NULL OR trim(content) = '')
                      AND (attachment_url IS NULL OR trim(attachment_url) = '')
                    """
                )
            )
            conn.commit()
            try:
                return res.rowcount or 0
            except Exception:
                return 0
        except Exception:
            conn.rollback()
            return 0


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
    """Add the ``custom_subtitle`` column to service provider profiles if missing."""

    for table in ("service_provider_profiles", "artist_profiles"):
        add_column_if_missing(
            engine,
            table,
            "custom_subtitle",
            "custom_subtitle VARCHAR",
        )


def ensure_price_visible_column(engine: Engine) -> None:
    """Add the ``price_visible`` column to service provider profiles if missing."""

    for table in ("service_provider_profiles", "artist_profiles"):
        add_column_if_missing(
            engine,
            table,
            "price_visible",
            "price_visible BOOLEAN NOT NULL DEFAULT TRUE",
        )


def ensure_portfolio_image_urls_column(engine: Engine) -> None:
    """Add the ``portfolio_image_urls`` column to service provider profiles if missing."""

    for table in ("service_provider_profiles", "artist_profiles"):
        add_column_if_missing(
            engine,
            table,
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


def ensure_media_url_column(engine: Engine) -> None:
    """Add the ``media_url`` column to ``services`` if it's missing."""

    add_column_if_missing(
        engine,
        "services",
        "media_url",
        "media_url VARCHAR NOT NULL DEFAULT ''",
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
    add_column_if_missing(
        engine,
        "services",
        "car_rental_price",
        "car_rental_price NUMERIC(10, 2)",
    )
    add_column_if_missing(
        engine,
        "services",
        "flight_price",
        "flight_price NUMERIC(10, 2)",
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
        engine, "bookings_simple", "deposit_amount", "deposit_amount NUMERIC(10, 2)"
    )
    add_column_if_missing(
        engine, "bookings_simple", "deposit_due_by", "deposit_due_by DATETIME"
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "deposit_paid",
        "deposit_paid BOOLEAN NOT NULL DEFAULT FALSE",
    )
    # Authorization hold fields for one-flow booking
    add_column_if_missing(
        engine,
        "bookings_simple",
        "artist_hold_id",
        "artist_hold_id VARCHAR",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "artist_hold_status",
        "artist_hold_status VARCHAR",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "artist_hold_amount",
        "artist_hold_amount NUMERIC(10, 2)",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "sound_hold_id",
        "sound_hold_id VARCHAR",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "sound_hold_status",
        "sound_hold_status VARCHAR",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "sound_hold_amount",
        "sound_hold_amount NUMERIC(10, 2)",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "charged_total_amount",
        "charged_total_amount NUMERIC(10, 2)",
    )


def ensure_mfa_columns(engine: Engine) -> None:
    """Add MFA fields to the ``users`` table if missing."""
    add_column_if_missing(engine, "users", "mfa_secret", "mfa_secret VARCHAR")
    add_column_if_missing(
        engine, "users", "mfa_enabled", "mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE"
    )
    add_column_if_missing(
        engine, "users", "mfa_recovery_tokens", "mfa_recovery_tokens TEXT"
    )


def ensure_refresh_token_columns(engine: Engine) -> None:
    """Add refresh token storage columns to ``users`` if missing.

    Columns:
    - refresh_token_hash TEXT (stores SHA-256 of refresh token)
    - refresh_token_expires_at DATETIME
    """
    add_column_if_missing(
        engine, "users", "refresh_token_hash", "refresh_token_hash VARCHAR"
    )
    add_column_if_missing(
        engine,
        "users",
        "refresh_token_expires_at",
        "refresh_token_expires_at DATETIME",
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


def ensure_sound_outreach_columns(engine: Engine) -> None:
    """Add link columns to ``sound_outreach_requests`` if missing."""

    add_column_if_missing(
        engine,
        "sound_outreach_requests",
        "supplier_booking_request_id",
        "supplier_booking_request_id INTEGER",
    )
    add_column_if_missing(
        engine,
        "sound_outreach_requests",
        "supplier_quote_id",
        "supplier_quote_id INTEGER",
    )


def ensure_booking_event_city_column(engine: Engine) -> None:
    """Ensure the ``event_city`` column exists on the ``bookings`` table."""
    add_column_if_missing(
        engine,
        "bookings",
        "event_city",
        "event_city VARCHAR",
    )


def ensure_booking_artist_deadline_column(engine: Engine) -> None:
    """Ensure the ``artist_accept_deadline_at`` column exists on the ``bookings`` table."""
    add_column_if_missing(
        engine,
        "bookings",
        "artist_accept_deadline_at",
        "artist_accept_deadline_at DATETIME",
    )


def ensure_quote_v2_sound_firm_column(engine: Engine) -> None:
    """Ensure the ``sound_firm`` column exists on ``quotes_v2``."""
    add_column_if_missing(
        engine,
        "quotes_v2",
        "sound_firm",
        "sound_firm VARCHAR",
    )


def ensure_rider_tables(engine: Engine) -> None:
    """Ensure rider and supplier pricebook tables exist (created by Base.metadata)."""
    # Tables are created via Base.metadata.create_all; this function exists as a hook if future column adds are needed.
    return None


def ensure_service_managed_markup_column(engine: Engine) -> None:
    """Ensure the service has a managed-by-artist markup percent column."""
    add_column_if_missing(
        engine,
        "services",
        "sound_managed_markup_percent",
        "sound_managed_markup_percent NUMERIC(6,2)",
    )


def ensure_booking_event_city_column(engine: Engine) -> None:
    """Ensure the ``event_city`` column exists on the ``bookings`` table."""

    add_column_if_missing(
        engine,
        "bookings",
        "event_city",
        "event_city VARCHAR",
    )


def ensure_quote_v2_sound_firm_column(engine: Engine) -> None:
    """Ensure the ``sound_firm`` column exists on ``quotes_v2``.

    Stored as a nullable TEXT/STRING; when set to 'true' the sound line item is
    considered firm. This avoids enum booleans for simpler cross-db support.
    """
    add_column_if_missing(
        engine,
        "quotes_v2",
        "sound_firm",
        "sound_firm VARCHAR",
    )
