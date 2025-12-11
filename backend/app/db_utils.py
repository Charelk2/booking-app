import os
from sqlalchemy import inspect, text, select
from sqlalchemy.engine import Engine
from sqlalchemy import Table, MetaData, Column, String as SAString, Integer as SAInteger

from app.utils.slug import slugify_name, generate_unique_slug


def add_column_if_missing(engine: Engine, table: str, column: str, ddl: str) -> None:
    """Add a column to *table* if it does not exist."""

    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return
    column_names = [col["name"] for col in inspector.get_columns(table)]
    if column not in column_names:
        with engine.connect() as conn:
            # Normalize cross‑DB type names (e.g., DATETIME -> TIMESTAMP on Postgres)
            normalized = ddl
            if engine.dialect.name == "postgresql":
                normalized = (
                    normalized.replace(" DATETIME", " TIMESTAMP")
                    .replace(" datetime", " timestamp")
                )
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {normalized}"))
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


def ensure_service_core_columns(engine: Engine) -> None:
    """Ensure essential columns exist on the ``services`` table.

    Some deployments started with a minimal ``services`` table (only ``id``),
    which breaks joins/filters after migrating to Postgres. This adds the core
    columns used across the app without requiring full Alembic history.

    Columns ensured (SQLite/Postgres safe):
    - artist_id INTEGER (FK not enforced here for portability)
    - title VARCHAR NOT NULL DEFAULT ''
    - description TEXT
    - price NUMERIC(10,2) NOT NULL DEFAULT 0
    - duration_minutes INTEGER NOT NULL DEFAULT 0
    """

    add_column_if_missing(
        engine,
        "services",
        "artist_id",
        "artist_id INTEGER",
    )
    add_column_if_missing(
        engine,
        "services",
        "title",
        "title VARCHAR NOT NULL DEFAULT ''",
    )
    add_column_if_missing(
        engine,
        "services",
        "description",
        "description TEXT",
    )
    add_column_if_missing(
        engine,
        "services",
        "price",
        "price NUMERIC(10, 2) NOT NULL DEFAULT 0",
    )
    add_column_if_missing(
        engine,
        "services",
        "duration_minutes",
        "duration_minutes INTEGER NOT NULL DEFAULT 0",
    )


def ensure_timestamp_columns(engine: Engine, table: str) -> None:
    """Ensure created_at and updated_at timestamp columns exist on a table.

    Uses DATETIME (normalized to TIMESTAMP on Postgres) and leaves them nullable
    to avoid backfilling requirements on existing rows.
    """
    add_column_if_missing(engine, table, "created_at", "created_at DATETIME")
    add_column_if_missing(engine, table, "updated_at", "updated_at DATETIME")


def ensure_timestamp_defaults(engine: Engine, table: str) -> None:
    """Ensure created_at/updated_at have DB defaults for new rows.

    - On Postgres: ALTER COLUMN ... SET DEFAULT NOW()
    - On SQLite/others: no-op (SQLite cannot alter column defaults easily without a table rewrite)
    """
    try:
        inspector = inspect(engine)
        if table not in inspector.get_table_names():
            return
        if engine.dialect.name != "postgresql":
            # Best-effort: skip for dialects that don't support ALTER COLUMN ... SET DEFAULT
            return
        cols = {c["name"].lower() for c in inspector.get_columns(table)}
        with engine.connect() as conn:
            changed = False
            if "created_at" in cols:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN created_at SET DEFAULT NOW()"))
                    changed = True
                except Exception:
                    pass
            if "updated_at" in cols:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN updated_at SET DEFAULT NOW()"))
                    changed = True
                except Exception:
                    pass
            if changed:
                try:
                    conn.commit()
                except Exception:
                    pass
    except Exception:
        # Never block startup on default-setting
        pass


def ensure_enum_values(engine: Engine, enum_name: str, values: list[str]) -> None:
    """Ensure a Postgres ENUM type has at least the given values.

    On SQLite or other dialects, this is a no-op. Values are added idempotently
    using "ADD VALUE IF NOT EXISTS".
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.connect() as conn:
            for v in values:
                try:
                    conn.execute(text(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS :val"), {"val": v})
                except Exception:
                    # Some Postgres versions don't support parameterizing ADD VALUE
                    try:
                        conn.execute(text(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{v}'"))
                    except Exception:
                        pass
            conn.commit()
    except Exception:
        # Best-effort; don't block startup on enum ensure
        pass


def ensure_service_status_column(engine: Engine) -> None:
    """Ensure moderation status column exists on services.

    status values: draft | pending_review | approved | rejected
    """
    add_column_if_missing(
        engine,
        "services",
        "status",
        "status VARCHAR NOT NULL DEFAULT 'pending_review'",
    )


def ensure_ledger_tables(engine: Engine) -> None:
    """Create lightweight ledger table if absent (SQLAlchemy metadata won't add to existing DB without migrations)."""
    inspector = inspect(engine)
    if "ledger_entries" not in inspector.get_table_names():
        with engine.connect() as conn:
            sql = """
                CREATE TABLE IF NOT EXISTS ledger_entries (
                  id INTEGER PRIMARY KEY,
                  booking_id INTEGER,
                  type VARCHAR NOT NULL,
                  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
                  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
                  meta JSON,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            if engine.dialect.name == "postgresql":
                # Use identity for Postgres
                sql = sql.replace("id INTEGER PRIMARY KEY", "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
                sql = sql.replace(" DATETIME", " TIMESTAMP")
            conn.execute(text(sql))
            conn.commit()
    # Ensure autoincrement semantics for existing Postgres tables
    ensure_identity_pk(engine, "ledger_entries", "id")


def ensure_payout_tables(engine: Engine) -> None:
    inspector = inspect(engine)
    if "payouts" not in inspector.get_table_names():
        with engine.connect() as conn:
            sql = """
                CREATE TABLE IF NOT EXISTS payouts (
                  id INTEGER PRIMARY KEY,
                  booking_id INTEGER,
                  provider_id INTEGER,
                  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
                  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
                  status VARCHAR NOT NULL DEFAULT 'queued',
                  type VARCHAR,
                  scheduled_at DATETIME,
                  paid_at DATETIME,
                  method VARCHAR,
                  reference VARCHAR,
                  batch_id VARCHAR,
                  meta JSON,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            if engine.dialect.name == "postgresql":
                sql = sql.replace("id INTEGER PRIMARY KEY", "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
                sql = sql.replace(" DATETIME", " TIMESTAMP")
            conn.execute(text(sql))
            conn.commit()
    ensure_identity_pk(engine, "payouts", "id")
    # Ensure columns in case the table existed with an older shape
    add_column_if_missing(engine, "payouts", "booking_id", "booking_id INTEGER")
    add_column_if_missing(engine, "payouts", "type", "type VARCHAR")
    add_column_if_missing(engine, "payouts", "scheduled_at", "scheduled_at DATETIME")
    add_column_if_missing(engine, "payouts", "paid_at", "paid_at DATETIME")
    add_column_if_missing(engine, "payouts", "method", "method VARCHAR")
    add_column_if_missing(engine, "payouts", "reference", "reference VARCHAR")
    add_column_if_missing(engine, "payouts", "meta", "meta JSON")


def ensure_dispute_table(engine: Engine) -> None:
    inspector = inspect(engine)
    if "disputes" not in inspector.get_table_names():
        with engine.connect() as conn:
            sql = """
                CREATE TABLE IF NOT EXISTS disputes (
                  id INTEGER PRIMARY KEY,
                  booking_id INTEGER NOT NULL,
                  status VARCHAR NOT NULL DEFAULT 'open',
                  reason VARCHAR,
                  assigned_admin_id INTEGER,
                  due_at DATETIME,
                  notes JSON,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            if engine.dialect.name == "postgresql":
                sql = sql.replace("id INTEGER PRIMARY KEY", "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
                sql = sql.replace(" DATETIME", " TIMESTAMP")
            conn.execute(text(sql))
            conn.commit()
    ensure_identity_pk(engine, "disputes", "id")


def ensure_email_sms_event_tables(engine: Engine) -> None:
    inspector = inspect(engine)
    with engine.connect() as conn:
        if "email_events" not in inspector.get_table_names():
            sql_email = """
                CREATE TABLE IF NOT EXISTS email_events (
                  id INTEGER PRIMARY KEY,
                  message_id VARCHAR,
                  recipient VARCHAR,
                  template VARCHAR,
                  event VARCHAR,
                  booking_id INTEGER,
                  user_id INTEGER,
                  payload JSON,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            if engine.dialect.name == "postgresql":
                sql_email = sql_email.replace("id INTEGER PRIMARY KEY", "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
                sql_email = sql_email.replace(" DATETIME", " TIMESTAMP")
            conn.execute(text(sql_email))
        if "sms_events" not in inspector.get_table_names():
            sql_sms = """
                CREATE TABLE IF NOT EXISTS sms_events (
                  id INTEGER PRIMARY KEY,
                  sid VARCHAR,
                  recipient VARCHAR,
                  status VARCHAR,
                  booking_id INTEGER,
                  user_id INTEGER,
                  payload JSON,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            if engine.dialect.name == "postgresql":
                sql_sms = sql_sms.replace("id INTEGER PRIMARY KEY", "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
                sql_sms = sql_sms.replace(" DATETIME", " TIMESTAMP")
            conn.execute(text(sql_sms))
        conn.commit()
    # Ensure identity on existing tables
    ensure_identity_pk(engine, "email_events", "id")
    ensure_identity_pk(engine, "sms_events", "id")


def ensure_audit_events_table(engine: Engine) -> None:
    inspector = inspect(engine)
    if "audit_events" not in inspector.get_table_names():
        with engine.connect() as conn:
            sql = """
                CREATE TABLE IF NOT EXISTS audit_events (
                  id INTEGER PRIMARY KEY,
                  actor_admin_id INTEGER NOT NULL,
                  entity VARCHAR NOT NULL,
                  entity_id VARCHAR NOT NULL,
                  action VARCHAR NOT NULL,
                  before JSON,
                  after JSON,
                  at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            if engine.dialect.name == "postgresql":
                sql = sql.replace("id INTEGER PRIMARY KEY", "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
                sql = sql.replace(" DATETIME", " TIMESTAMP")
            conn.execute(text(sql))
            conn.commit()
    ensure_identity_pk(engine, "audit_events", "id")


def ensure_service_moderation_logs(engine: Engine) -> None:
    inspector = inspect(engine)
    if "service_moderation_logs" not in inspector.get_table_names():
        with engine.connect() as conn:
            sql = """
                CREATE TABLE IF NOT EXISTS service_moderation_logs (
                  id INTEGER PRIMARY KEY,
                  service_id INTEGER NOT NULL,
                  admin_id INTEGER NOT NULL,
                  action VARCHAR NOT NULL,
                  reason VARCHAR,
                  at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            if engine.dialect.name == "postgresql":
                sql = sql.replace("id INTEGER PRIMARY KEY", "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
                sql = sql.replace(" DATETIME", " TIMESTAMP")
            conn.execute(text(sql))
            conn.commit()
    ensure_identity_pk(engine, "service_moderation_logs", "id")


def ensure_search_events_table(engine: Engine) -> None:
    """Create a lightweight search_events table for analytics if absent.

    Stores anonymous and user-linked search events so we can later derive
    popular locations and search history. Designed to be safe across SQLite
    and Postgres deployments without full Alembic history.
    """
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    is_pg = engine.dialect.name == "postgresql"

    if "search_events" not in tables:
        with engine.connect() as conn:
            sql = """
                CREATE TABLE IF NOT EXISTS search_events (
                  id INTEGER PRIMARY KEY,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  user_id INTEGER,
                  session_id VARCHAR,
                  source VARCHAR NOT NULL,
                  category_value VARCHAR,
                  location VARCHAR,
                  when_date DATE,
                  results_count INTEGER,
                  search_id VARCHAR,
                  clicked_artist_id INTEGER,
                  click_rank INTEGER,
                  meta JSON
                )
            """
            if is_pg:
                sql = sql.replace(
                    "id INTEGER PRIMARY KEY",
                    "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY",
                )
                sql = sql.replace(" DATETIME", " TIMESTAMP")
            conn.execute(text(sql))
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_search_events_created_at "
                        "ON search_events(created_at)"
                    )
                )
            except Exception:
                pass
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_search_events_location "
                        "ON search_events(location)"
                    )
                )
            except Exception:
                pass
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_search_events_user_created_at "
                        "ON search_events(user_id, created_at)"
                    )
                )
            except Exception:
                pass
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_search_events_search_id "
                        "ON search_events(search_id)"
                    )
                )
            except Exception:
                pass
            conn.commit()
    # Ensure autoincrement semantics for existing Postgres tables
    ensure_identity_pk(engine, "search_events", "id")


def ensure_performance_indexes(engine: Engine) -> None:
    """Create lightweight indexes that speed up common homepage queries.

    - service_provider_profiles(updated_at)
    - service_provider_profiles(location)
    - services(artist_id, price)
    """
    inspector = inspect(engine)
    # Collect existing index names safely (SQLAlchemy returns List[Dict])
    existing = set()
    if "service_provider_profiles" in inspector.get_table_names():
        try:
            existing = {idx.get("name") for idx in inspector.get_indexes("service_provider_profiles") if isinstance(idx, dict)}
        except Exception:
            existing = set()
    with engine.connect() as conn:
        try:
            if "idx_spp_updated_at" not in existing:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_spp_updated_at ON service_provider_profiles(updated_at)"))
            if "idx_spp_location" not in existing:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_spp_location ON service_provider_profiles(location)"))
            conn.commit()
        except Exception:
            conn.rollback()

    existing_srv = set()
    if "services" in inspector.get_table_names():
        try:
            existing_srv = {idx.get("name") for idx in inspector.get_indexes("services") if isinstance(idx, dict)}
        except Exception:
            existing_srv = set()
    with engine.connect() as conn:
        try:
            if "idx_services_artist_price" not in existing_srv:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_services_artist_price ON services(artist_id, price)"))
            conn.commit()
        except Exception:
            conn.rollback()


def ensure_message_system_key_index(engine: Engine) -> None:
    """Ensure an index exists on messages.system_key for ILIKE/starts-with filters.

    On Postgres, also create a functional lower(system_key) index to aid case-insensitive lookups.
    """
    inspector = inspect(engine)
    if "messages" not in inspector.get_table_names():
        return
    with engine.connect() as conn:
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_system_key ON messages(system_key)"))
            if engine.dialect.name == "postgresql":
                # Functional index for case-insensitive queries
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_system_key_lower ON messages (lower(system_key))"))
            conn.commit()
        except Exception:
            conn.rollback()


def ensure_message_core_indexes(engine: Engine) -> None:
    """Ensure helpful composite indexes exist on messages for hot queries.

    Adds the following when missing:
    - ix_messages_request_time(booking_request_id, timestamp)
    - ix_messages_request_id_id(booking_request_id, id)
    """
    try:
        inspector = inspect(engine)
        if "messages" not in inspector.get_table_names():
            return
        # Collect existing index names safely
        existing = set()
        try:
            existing = {idx.get("name") for idx in inspector.get_indexes("messages") if isinstance(idx, dict)}
        except Exception:
            existing = set()
        with engine.connect() as conn:
            try:
                if "ix_messages_request_time" not in existing:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_request_time ON messages(booking_request_id, timestamp)"))
                if "ix_messages_request_id_id" not in existing:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_request_id_id ON messages(booking_request_id, id)"))
                conn.commit()
            except Exception:
                conn.rollback()
    except Exception:
        # Best-effort; never block startup
        pass


def ensure_notification_core_indexes(engine: Engine) -> None:
    """Ensure helpful indexes exist on notifications.

    Adds the following when missing:
    - idx_notifications_user_ts(user_id, timestamp)
    - idx_notifications_user_type_unread_ts(user_id, type, is_read, timestamp)
    """
    try:
        inspector = inspect(engine)
        if "notifications" not in inspector.get_table_names():
            return
        existing = set()
        try:
            existing = {idx.get("name") for idx in inspector.get_indexes("notifications") if isinstance(idx, dict)}
        except Exception:
            existing = set()
        with engine.connect() as conn:
            try:
                if "idx_notifications_user_ts" not in existing:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_user_ts ON notifications(user_id, timestamp)"))
                if "idx_notifications_user_type_unread_ts" not in existing:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notifications_user_type_unread_ts ON notifications(user_id, type, is_read, timestamp)"))
                conn.commit()
            except Exception:
                conn.rollback()
    except Exception:
        # Best-effort; never block startup
        pass

def ensure_message_unread_indexes(engine: Engine) -> None:
    """Ensure indexes that accelerate unread-count and mark-read queries.

    Optimizes queries of the form:
      - COUNT(*) joined via booking_requests for user inbox totals
      - UPDATE ... SET is_read=TRUE WHERE booking_request_id=? AND sender_id!=? AND is_read IS NOT TRUE

    Strategy:
      - Composite partial index on (booking_request_id, sender_id, id) WHERE is_read IS NOT TRUE
        on Postgres/SQLite. Fallback to a full composite index when partial indexes
        are not supported.
    """
    try:
        inspector = inspect(engine)
        if "messages" not in inspector.get_table_names():
            return
        existing = set()
        try:
            existing = {idx.get("name") for idx in inspector.get_indexes("messages") if isinstance(idx, dict)}
        except Exception:
            existing = set()

        with engine.connect() as conn:
            try:
                if engine.dialect.name in ("postgresql", "sqlite"):
                    # Partial index: only unread rows
                    if "ix_messages_unread_bsid_partial" not in existing:
                        conn.execute(
                            text(
                                "CREATE INDEX IF NOT EXISTS ix_messages_unread_bsid_partial "
                                "ON messages(booking_request_id, sender_id, id) "
                                "WHERE is_read IS NOT TRUE"
                            )
                        )
                else:
                    # Fallback composite index
                    if "ix_messages_unread_bsid" not in existing:
                        conn.execute(
                            text(
                                "CREATE INDEX IF NOT EXISTS ix_messages_unread_bsid "
                                "ON messages(booking_request_id, sender_id, is_read, id)"
                            )
                        )
                conn.commit()
            except Exception:
                conn.rollback()
    except Exception:
        # Best-effort; never block startup
        pass


def ensure_booking_requests_user_indexes(engine: Engine) -> None:
    """Ensure indexes on booking_requests for user membership filters.

    Adds missing index on (client_id). The artist_id index typically exists from
    migrations; we guard both for safety.
    """
    try:
        inspector = inspect(engine)
        if "booking_requests" not in inspector.get_table_names():
            return
        existing = set()
        try:
            existing = {idx.get("name") for idx in inspector.get_indexes("booking_requests") if isinstance(idx, dict)}
        except Exception:
            existing = set()
        with engine.connect() as conn:
            try:
                if "ix_booking_requests_client_id" not in existing:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_booking_requests_client_id ON booking_requests(client_id)"))
                if "ix_booking_requests_artist_id" not in existing:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_booking_requests_artist_id ON booking_requests(artist_id)"))
                conn.commit()
            except Exception:
                conn.rollback()
    except Exception:
        pass


def ensure_identity_pk(engine: Engine, table: str, column: str = "id") -> None:
    """On Postgres, ensure the given table.column autogenerates values.

    Converts an existing INTEGER PK without default to IDENTITY; falls back to a sequence if needed.
    No-op on non-Postgres.
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        inspector = inspect(engine)
        if table not in inspector.get_table_names():
            return
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    "SELECT column_default, identity_generation "
                    "FROM information_schema.columns "
                    "WHERE table_name=:t AND column_name=:c"
                ),
                {"t": table, "c": column},
            ).fetchone()
            default_expr = row[0] if row else None
            identity_generation = (row[1] or "").strip().lower() if row else ""
            # If the column is already identity or has a default/sequence, skip.
            if default_expr or identity_generation in {"always", "by default"}:
                return
            try:
                conn.execute(
                    text(
                        f"ALTER TABLE {table} ALTER COLUMN {column} ADD GENERATED BY DEFAULT AS IDENTITY"
                    )
                )
            except Exception:
                # Fallback: attach a sequence default (keeps idempotent behaviour)
                seq = f"{table}_{column}_seq"
                conn.execute(text(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '{seq}') THEN CREATE SEQUENCE {seq}; END IF; END $$;"))
                conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT nextval('{seq}')"))
    except Exception:
        # Best-effort; never block startup
        pass


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
            # message_type is a Postgres ENUM; cast to text before LOWER/UPPER to avoid
            # function-not-found errors when the column is an enum type.
            conn.execute(text("UPDATE messages SET message_type='USER' WHERE lower(message_type::text)='text'"))
            conn.execute(text("UPDATE messages SET message_type=upper(message_type::text)::message_type"))
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


def ensure_attachment_meta_column(engine: Engine) -> None:
    """Add the ``attachment_meta`` column if it's missing."""

    add_column_if_missing(
        engine,
        "messages",
        "attachment_meta",
        "attachment_meta JSON",
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


def ensure_message_reply_to_column(engine: Engine) -> None:
    """Add the ``reply_to_message_id`` column to ``messages`` if missing.

    This supports threaded replies in chat. We keep it nullable and do not
    enforce a foreign key constraint at runtime to remain compatible with
    SQLite without table rebuilds. The ORM still uses it to hydrate
    reply previews.
    """
    add_column_if_missing(
        engine,
        "messages",
        "reply_to_message_id",
        "reply_to_message_id INTEGER",
    )


def ensure_message_reactions_table(engine: Engine) -> None:
    """Create the ``message_reactions`` table if it doesn't exist.

    Columns:
      - id INTEGER PRIMARY KEY
      - message_id INTEGER NOT NULL
      - user_id INTEGER NOT NULL
      - emoji VARCHAR NOT NULL

    Constraints:
      - UNIQUE(message_id, user_id, emoji)
      - INDEX on (message_id)
    """
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    is_pg = engine.dialect.name == "postgresql"
    if "message_reactions" not in tables:
        # Create table with proper autoincrement semantics per-dialect
        if is_pg:
            ddl = (
                "CREATE TABLE IF NOT EXISTS message_reactions ("
                "id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,"
                "message_id INTEGER NOT NULL,"
                "user_id INTEGER NOT NULL,"
                "emoji VARCHAR NOT NULL,"
                "created_at TIMESTAMP,"
                "updated_at TIMESTAMP,"
                "UNIQUE(message_id, user_id, emoji)"
                ")"
            )
        else:
            ddl = (
                "CREATE TABLE IF NOT EXISTS message_reactions ("
                "id INTEGER PRIMARY KEY,"
                "message_id INTEGER NOT NULL,"
                "user_id INTEGER NOT NULL,"
                "emoji VARCHAR NOT NULL,"
                "created_at DATETIME,"
                "updated_at DATETIME,"
                "UNIQUE(message_id, user_id, emoji)"
                ")"
            )
        if is_pg:
            ddl = ddl.replace(" DATETIME", " TIMESTAMP")
        with engine.begin() as conn:
            conn.execute(text(ddl))
            try:
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_msg_reaction_message ON message_reactions(message_id)"))
            except Exception:
                pass
    else:
        # Table exists; on Postgres ensure id is identity/autoincrement for inserts
        if is_pg:
            try:
                # Reuse the idempotent identity helper so we don't repeatedly
                # attempt to add IDENTITY when it already exists or when a
                # default/sequence is present.
                ensure_identity_pk(engine, "message_reactions", "id")
                # Ensure the message_id index exists for fast lookups
                with engine.begin() as conn:
                    try:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_msg_reaction_message ON message_reactions(message_id)"))
                    except Exception:
                        pass
            except Exception:
                # Best-effort; do not block startup
                pass


def ensure_booka_system_user(engine: Engine) -> None:
    """Ensure a lightweight 'Booka' system user exists for SYSTEM messages.

    The user will not be used for login. It serves as the sender for system
    messages so the data model has a consistent origin.
    """
    email = os.getenv("BOOKA_SYSTEM_EMAIL", "system@booka.co.za").strip().lower()
    with engine.connect() as conn:
        try:
            exists = conn.execute(text("SELECT id FROM users WHERE lower(email)=:e LIMIT 1"), {"e": email}).fetchone()
            if exists:
                return
            # Insert minimal record. Password is a placeholder; the account is not used for auth.
            conn.execute(text(
                """
                INSERT INTO users (email, password, first_name, last_name, phone_number, is_active, is_verified, user_type)
                VALUES (:email, :password, :first_name, :last_name, :phone, 1, 1, 'client')
                """
            ), {
                "email": email,
                "password": "!disabled-system-user!",
                "first_name": "Booka",
                "last_name": "",
                "phone": None,
            })
            conn.commit()
        except Exception:
            conn.rollback()


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

    # Core linkage columns used throughout the app
    add_column_if_missing(
        engine,
        "bookings_simple",
        "quote_id",
        "quote_id INTEGER",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "artist_id",
        "artist_id INTEGER",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "client_id",
        "client_id INTEGER",
    )
    add_column_if_missing(
        engine,
        "bookings_simple",
        "confirmed",
        "confirmed BOOLEAN NOT NULL DEFAULT TRUE",
    )

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


def remove_deposit_columns_from_booking_simple(engine: Engine) -> None:
    """Drop legacy deposit columns from bookings_simple if they exist.

    Older schemas included deposit_amount, deposit_due_by, and deposit_paid.
    The application no longer uses deposits; these columns can cause NOT NULL
    constraint failures on insert if left behind. Safely drop them.
    """
    try:
        inspector = inspect(engine)
        if "bookings_simple" not in inspector.get_table_names():
            return
        cols = {c["name"].lower() for c in inspector.get_columns("bookings_simple")}
        to_drop = [
            c for c in ("deposit_amount", "deposit_due_by", "deposit_paid") if c in cols
        ]
        if not to_drop:
            return
        with engine.connect() as conn:
            for c in to_drop:
                try:
                    conn.execute(text(f"ALTER TABLE bookings_simple DROP COLUMN IF EXISTS {c}"))
                except Exception:
                    # As a fallback, attempt to relax NOT NULL to avoid runtime errors
                    try:
                        conn.execute(text(f"ALTER TABLE bookings_simple ALTER COLUMN {c} DROP NOT NULL"))
                    except Exception:
                        pass
            try:
                conn.commit()
            except Exception:
                pass
    except Exception:
        # Never block startup on cleanup
        pass


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


def ensure_booking_request_service_extras_column(engine: Engine) -> None:
    """Add service_extras JSON column to ``booking_requests`` if missing."""

    add_column_if_missing(
        engine,
        "booking_requests",
        "service_extras",
        "service_extras JSON",
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


def ensure_service_provider_contact_columns(engine: Engine) -> None:
    """Ensure contact and banking columns exist on service_provider_profiles.

    These are additive, nullable string columns so it's safe to apply on
    existing databases without migrations.
    """
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "contact_email",
        "contact_email VARCHAR",
    )
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "contact_phone",
        "contact_phone VARCHAR",
    )
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "contact_website",
        "contact_website VARCHAR",
    )
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "bank_name",
        "bank_name VARCHAR",
    )
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "bank_account_name",
        "bank_account_name VARCHAR",
    )
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "bank_account_number",
        "bank_account_number VARCHAR",
    )
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "bank_branch_code",
        "bank_branch_code VARCHAR",
    )

def ensure_service_provider_onboarding_columns(engine: Engine) -> None:
    """Ensure onboarding/completion and cancellation policy columns exist.

    - onboarding_completed BOOLEAN: gates creating services until profile complete
    - cancellation_policy TEXT: optional policy text shown to clients
    """
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "onboarding_completed",
        "onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE",
    )
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "cancellation_policy",
        "cancellation_policy TEXT",
    )


def ensure_service_provider_slug_column(engine: Engine) -> None:
    """Ensure a slug column exists on service_provider_profiles.

    The column is a simple VARCHAR; uniqueness is enforced via a separate
    index helper so existing deployments can add the column first and
    backfill values before the unique constraint is applied.
    """
    add_column_if_missing(
        engine,
        "service_provider_profiles",
        "slug",
        "slug VARCHAR",
    )


def ensure_service_provider_slug_index(engine: Engine) -> None:
    """Ensure a unique index exists on service_provider_profiles.slug."""
    try:
        inspector = inspect(engine)
        if "service_provider_profiles" not in inspector.get_table_names():
            return
        existing = {idx.get("name") for idx in inspector.get_indexes("service_provider_profiles") if isinstance(idx, dict)}
        if "idx_spp_slug" in existing:
            return
        with engine.connect() as conn:
            # UNIQUE index so each slug maps to exactly one provider.
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_spp_slug "
                    "ON service_provider_profiles(slug)"
                )
            )
            conn.commit()
    except Exception:
        # Never block startup on index creation; slugs are still validated
        # in application code.
        pass


def backfill_service_provider_slugs(engine: Engine) -> None:
    """Populate missing slugs for existing service providers.

    This is safe to run repeatedly; it only fills rows where ``slug`` is NULL
    or empty and avoids duplicate slugs by appending numeric suffixes.
    """
    try:
        inspector = inspect(engine)
        if "service_provider_profiles" not in inspector.get_table_names():
            return
        metadata = MetaData()
        spp = Table("service_provider_profiles", metadata, autoload_with=engine)
        users = None
        if "users" in inspector.get_table_names():
            users = Table("users", metadata, autoload_with=engine)

        with engine.begin() as conn:
            # Collect all existing non-empty slugs to avoid collisions.
            existing_rows = conn.execute(
                select(spp.c.slug).where(spp.c.slug.is_not(None))
            ).fetchall()
            existing_slugs = {str(row.slug) for row in existing_rows if getattr(row, "slug", None)}

            # Load profiles that are missing a slug.
            if users is not None:
                rows = conn.execute(
                    select(
                        spp.c.user_id,
                        spp.c.slug,
                        spp.c.business_name,
                        spp.c.trading_name,
                        users.c.first_name,
                        users.c.last_name,
                    )
                    .select_from(spp.join(users, spp.c.user_id == users.c.id))
                    .where((spp.c.slug.is_(None)) | (spp.c.slug == ""))
                ).fetchall()
            else:
                rows = conn.execute(
                    select(
                        spp.c.user_id,
                        spp.c.slug,
                        spp.c.business_name,
                        spp.c.trading_name,
                    ).where((spp.c.slug.is_(None)) | (spp.c.slug == ""))
                ).fetchall()

            for row in rows:
                user_id = int(row.user_id)
                business_name = getattr(row, "business_name", None) or ""
                trading_name = getattr(row, "trading_name", None) or ""
                first_name = getattr(row, "first_name", "") if hasattr(row, "first_name") else ""
                last_name = getattr(row, "last_name", "") if hasattr(row, "last_name") else ""

                name_candidate = business_name or trading_name or f"{first_name} {last_name}".strip()
                if not name_candidate:
                    name_candidate = f"artist-{user_id}"
                # Normalize and ensure uniqueness against the evolving set.
                base = slugify_name(name_candidate) or f"artist-{user_id}"
                slug = generate_unique_slug(base, existing_slugs)
                existing_slugs.add(slug)
                conn.execute(
                    spp.update()
                    .where(spp.c.user_id == user_id)
                    .values(slug=slug)
                )
    except Exception:
        # Best-effort: never block startup if backfill fails.
        pass

def ensure_service_provider_vat_columns(engine: Engine) -> None:
    """Ensure VAT/legal/agent invoicing columns exist on service_provider_profiles.

    All columns are nullable and added additively for safe rollout without full migrations.
    """
    add_column_if_missing(engine, "service_provider_profiles", "legal_name", "legal_name VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "trading_name", "trading_name VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "billing_address_line1", "billing_address_line1 VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "billing_address_line2", "billing_address_line2 VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "billing_city", "billing_city VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "billing_region", "billing_region VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "billing_postal_code", "billing_postal_code VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "billing_country", "billing_country VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "invoice_email", "invoice_email VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "vat_registered", "vat_registered BOOLEAN")
    add_column_if_missing(engine, "service_provider_profiles", "vat_number", "vat_number VARCHAR")
    add_column_if_missing(engine, "service_provider_profiles", "vat_rate", "vat_rate NUMERIC(5,4)")
    add_column_if_missing(engine, "service_provider_profiles", "agent_invoicing_consent", "agent_invoicing_consent BOOLEAN")
    add_column_if_missing(engine, "service_provider_profiles", "agent_invoicing_consent_date", "agent_invoicing_consent_date DATETIME")

def ensure_invoice_agent_columns(engine: Engine) -> None:
    """Ensure invoice fields for agent-mode are present.

    Adds: invoice_type, invoice_number, series_key, issuer_snapshot, recipient_snapshot,
    supersedes_id, hash_snapshot, vat_breakdown_snapshot.
    """
    add_column_if_missing(engine, "invoices", "invoice_type", "invoice_type VARCHAR")
    add_column_if_missing(engine, "invoices", "invoice_number", "invoice_number VARCHAR")
    add_column_if_missing(engine, "invoices", "series_key", "series_key VARCHAR")
    add_column_if_missing(engine, "invoices", "issuer_snapshot", "issuer_snapshot JSON")
    add_column_if_missing(engine, "invoices", "recipient_snapshot", "recipient_snapshot JSON")
    add_column_if_missing(engine, "invoices", "supersedes_id", "supersedes_id INTEGER")
    add_column_if_missing(engine, "invoices", "hash_snapshot", "hash_snapshot VARCHAR(64)")
    add_column_if_missing(engine, "invoices", "vat_breakdown_snapshot", "vat_breakdown_snapshot JSON")

def ensure_invoice_sequences_table(engine: Engine) -> None:
    """Ensure the invoice_sequences table exists for per-series numbering.

    Columns:
      - series_key VARCHAR PRIMARY KEY
      - current_seq INTEGER NOT NULL DEFAULT 0
    """
    inspector = inspect(engine)
    if "invoice_sequences" in inspector.get_table_names():
        return
    metadata = MetaData()
    table = Table(
        "invoice_sequences",
        metadata,
        Column("series_key", SAString, primary_key=True),
        Column("current_seq", SAInteger, nullable=False, default=0),
    )
    metadata.create_all(engine)

def ensure_invoice_number_unique_index(engine: Engine) -> None:
    """Ensure a UNIQUE index on invoices.invoice_number exists (best-effort).

    - On Postgres/SQLite: CREATE UNIQUE INDEX IF NOT EXISTS ...
    - Other dialects: no-op.
    """
    try:
        if engine.dialect.name not in {"postgresql", "sqlite"}:
            return
        with engine.connect() as conn:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_uidx ON invoices (invoice_number)"))
            conn.commit()
    except Exception:
        # Non-fatal; uniqueness still enforced at allocator level by low contention
        pass

def ensure_invoice_booking_type_unique_index(engine: Engine) -> None:
    """Ensure a UNIQUE index on (booking_id, invoice_type) to enforce idempotency.

    Best-effort: created on Postgres/SQLite; no-op on other dialects.
    """
    try:
        if engine.dialect.name not in {"postgresql", "sqlite"}:
            return
        with engine.connect() as conn:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS invoices_booking_type_uidx ON invoices (booking_id, invoice_type)"
            ))
            conn.commit()
    except Exception:
        # Non-fatal: application-level idempotency still guards common paths
        pass

def ensure_booking_simple_agent_columns(engine: Engine) -> None:
    """Ensure agent-mode columns exist on bookings_simple."""
    add_column_if_missing(engine, "bookings_simple", "provider_profile_snapshot", "provider_profile_snapshot JSON")
    add_column_if_missing(engine, "bookings_simple", "client_billing_snapshot", "client_billing_snapshot JSON")
    add_column_if_missing(engine, "bookings_simple", "payment_classification", "payment_classification VARCHAR")
    add_column_if_missing(engine, "bookings_simple", "supply_date", "supply_date DATETIME")


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
