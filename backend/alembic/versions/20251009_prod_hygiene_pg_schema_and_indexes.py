"""Production hygiene: enums, defaults, identity, and indexes (Postgres-first)

Revision ID: 20251009_prod_hygiene
Revises: 5831ac500830
Create Date: 2025-10-09 13:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20251009_prod_hygiene"
down_revision: Union[str, None] = "5831ac500830"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # 1) Enums: add lowercase values idempotently (Postgres only)
    if dialect == "postgresql":
        for enum_name, values in [
            ("quotestatusv2", ["pending", "accepted", "rejected", "expired"]),
            ("quotestatus", [
                "pending_client_action",
                "accepted_by_client",
                "rejected_by_client",
                "confirmed_by_artist",
                "withdrawn_by_artist",
                "expired",
            ]),
            ("invoicestatus", ["unpaid", "partial", "paid", "overdue"]),
        ]:
            for v in values:
                op.execute(sa.text(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS :val").bindparams(val=v))

    # 2) bookings_simple: core linkage columns (idempotent ADD COLUMN IF NOT EXISTS)
    if dialect == "postgresql":
        op.execute(sa.text(
            """
            ALTER TABLE bookings_simple
              ADD COLUMN IF NOT EXISTS quote_id INTEGER,
              ADD COLUMN IF NOT EXISTS artist_id INTEGER,
              ADD COLUMN IF NOT EXISTS client_id INTEGER,
              ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT TRUE,
              ADD COLUMN IF NOT EXISTS payment_status VARCHAR,
              ADD COLUMN IF NOT EXISTS payment_id VARCHAR,
              ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2),
              ADD COLUMN IF NOT EXISTS deposit_due_by TIMESTAMP,
              ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN NOT NULL DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS charged_total_amount NUMERIC(10,2)
            """
        ))

    # 3) Timestamp defaults NOW() (Postgres only, guard per table/column)
    if dialect == "postgresql":
        tables = [
            "services", "bookings", "calendar_accounts", "service_provider_profiles",
            "notifications", "users", "admin_users", "booking_requests", "quotes",
            "quotes_v2", "invoices", "bookings_simple",
        ]
        for t in tables:
            # Use DO blocks to avoid errors when columns are missing
            op.execute(sa.text(
                f"""
                DO $$ BEGIN
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='{t}' AND column_name='created_at'
                  ) THEN
                    EXECUTE 'ALTER TABLE {t} ALTER COLUMN created_at SET DEFAULT NOW()';
                  END IF;
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='{t}' AND column_name='updated_at'
                  ) THEN
                    EXECUTE 'ALTER TABLE {t} ALTER COLUMN updated_at SET DEFAULT NOW()';
                  END IF;
                END $$;
                """
            ))

    # 4) Performance indexes (CONCURRENTLY on Postgres)
    # messages: composite paging + filters
    if dialect == "postgresql":
        # Helper to create index only if missing
        bind = op.get_bind()
        insp = sa.inspect(bind)
        existing_msg = set()
        try:
            existing_msg = {ix.get("name") for ix in insp.get_indexes("messages")}
        except Exception:
            existing_msg = set()
        if "ix_messages_request_time" not in existing_msg:
            op.create_index(
                "ix_messages_request_time",
                "messages",
                ["booking_request_id", "timestamp"],
                unique=False,
            )
        if "ix_messages_request_id_id" not in existing_msg:
            op.create_index(
                "ix_messages_request_id_id",
                "messages",
                ["booking_request_id", "id"],
                unique=False,
            )
        if "ix_messages_request_type_time" not in existing_msg:
            op.create_index(
                "ix_messages_request_type_time",
                "messages",
                ["booking_request_id", "message_type", "timestamp"],
                unique=False,
            )
        if "ix_messages_system_key" not in existing_msg:
            op.create_index(
                "ix_messages_system_key",
                "messages",
                ["system_key"],
                unique=False,
            )
        # Functional index for case-insensitive lookups (if ILIKE used)
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_messages_system_key_lower ON messages (lower(system_key))"
        ))

        # notifications: partial unread + time
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS idx_notifications_user_unread "
            "ON notifications (user_id, \"timestamp\" DESC) WHERE is_read = false"
        ))
        existing_notif = set()
        try:
            existing_notif = {ix.get("name") for ix in insp.get_indexes("notifications")}
        except Exception:
            existing_notif = set()
        if "idx_notifications_user_time" not in existing_notif:
            op.create_index(
                "idx_notifications_user_time",
                "notifications",
                ["user_id", "timestamp"],
                unique=False,
            )

        # booking_requests: artist/client by recency
        existing_br = set()
        try:
            existing_br = {ix.get("name") for ix in insp.get_indexes("booking_requests")}
        except Exception:
            existing_br = set()
        if "idx_br_artist_time" not in existing_br:
            op.create_index(
                "idx_br_artist_time",
                "booking_requests",
                ["artist_id", "created_at"],
                unique=False,
            )
        if "idx_br_client_time" not in existing_br:
            op.create_index(
                "idx_br_client_time",
                "booking_requests",
                ["client_id", "created_at"],
                unique=False,
            )

        # quotes_v2: pending expiry scans
        existing_qv2 = set()
        try:
            existing_qv2 = {ix.get("name") for ix in insp.get_indexes("quotes_v2")}
        except Exception:
            existing_qv2 = set()
        if "idx_quotes_v2_status_expires" not in existing_qv2:
            op.create_index(
                "idx_quotes_v2_status_expires",
                "quotes_v2",
                ["status", "expires_at"],
                unique=False,
            )

        # bookings_simple: join on quote
        existing_bs = set()
        try:
            existing_bs = {ix.get("name") for ix in insp.get_indexes("bookings_simple")}
        except Exception:
            existing_bs = set()
        if "idx_bookings_simple_quote" not in existing_bs:
            op.create_index(
                "idx_bookings_simple_quote",
                "bookings_simple",
                ["quote_id"],
                unique=False,
            )

        # services and profiles (home/list)
        existing_srv = set()
        try:
            existing_srv = {ix.get("name") for ix in insp.get_indexes("services")}
        except Exception:
            existing_srv = set()
        if "idx_services_artist_price" not in existing_srv:
            op.create_index(
                "idx_services_artist_price",
                "services",
                ["artist_id", "price"],
                unique=False,
            )
        existing_spp = set()
        try:
            existing_spp = {ix.get("name") for ix in insp.get_indexes("service_provider_profiles")}
        except Exception:
            existing_spp = set()
        if "idx_spp_updated_at" not in existing_spp:
            op.create_index(
                "idx_spp_updated_at",
                "service_provider_profiles",
                ["updated_at"],
                unique=False,
            )
        if "idx_spp_location" not in existing_spp:
            op.create_index(
                "idx_spp_location",
                "service_provider_profiles",
                ["location"],
                unique=False,
            )

    # 5) Identity/sequence retrofits (Postgres only). Best-effort.
    if dialect == "postgresql":
        tables = [
            "message_reactions",
            "ledger_entries",
            "payouts",
            "disputes",
            "email_events",
            "sms_events",
            "audit_events",
            "service_moderation_logs",
        ]
        # Ensure message_reactions exists with minimal schema
        op.execute(sa.text(
            """
            CREATE TABLE IF NOT EXISTS message_reactions (
              id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
              message_id INTEGER NOT NULL,
              user_id INTEGER NOT NULL,
              emoji VARCHAR NOT NULL,
              created_at TIMESTAMP,
              updated_at TIMESTAMP,
              UNIQUE(message_id, user_id, emoji)
            )
            """
        ))
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_msg_reaction_message ON message_reactions(message_id)"
        ))
        for t in tables:
            # Convert id to IDENTITY if neither identity nor default is present; otherwise skip.
            op.execute(sa.text(
                f"""
                DO $$ BEGIN
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='{t}' AND column_name='id' AND is_identity='YES'
                  ) THEN
                    -- already identity
                    NULL;
                  ELSIF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='{t}' AND column_name='id' AND column_default IS NOT NULL
                  ) THEN
                    -- already has a default (sequence) – leave as is
                    NULL;
                  ELSE
                    BEGIN
                      EXECUTE 'ALTER TABLE {t} ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY';
                    EXCEPTION WHEN others THEN
                      IF NOT EXISTS (
                        SELECT 1 FROM pg_class WHERE relname = '{t}_id_seq'
                      ) THEN
                        EXECUTE 'CREATE SEQUENCE {t}_id_seq';
                      END IF;
                      EXECUTE 'ALTER TABLE {t} ALTER COLUMN id SET DEFAULT nextval(''{t}_id_seq'')';
                    END;
                  END IF;
                END $$;
                """
            ))


def downgrade() -> None:
    # Intentionally conservative: do not drop enums or identity defaults.
    # Drop non-critical indexes to revert footprint.
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        for tbl, idxs in [
            ("messages", [
                "ix_messages_request_time",
                "ix_messages_request_id_id",
                "ix_messages_request_type_time",
                "ix_messages_system_key",
                "ix_messages_system_key_lower",
            ]),
            ("notifications", [
                "idx_notifications_user_unread",
                "idx_notifications_user_time",
            ]),
            ("booking_requests", [
                "idx_br_artist_time",
                "idx_br_client_time",
            ]),
            ("quotes_v2", ["idx_quotes_v2_status_expires"]),
            ("bookings_simple", ["idx_bookings_simple_quote"]),
            ("services", ["idx_services_artist_price"]),
            ("service_provider_profiles", ["idx_spp_updated_at", "idx_spp_location"]),
        ]:
            for idx in idxs:
                try:
                    op.drop_index(idx, table_name=tbl)
                except Exception:
                    pass
