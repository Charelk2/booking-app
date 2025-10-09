"""unify booking status enum

Revision ID: e03ae2c1f3b6
Revises: d00fbf65c0b4
Create Date: 2025-09-30 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e03ae2c1f3b6'
down_revision: Union[str, None] = 'd00fbf65c0b4'
branch_labels: Union[str, Sequence[str], None] = None
# Ensure dependencies exist before altering types on Postgres
# - bookings table (b7c1d2e3f4a5)
# - booking_requests table (b8d2e4f6a7c8)
depends_on: Union[str, Sequence[str], None] = ('b7c1d2e3f4a5', 'b8d2e4f6a7c8')


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    # On SQLite, there is no ENUM/TYPE support. Ensure values are normalized and exit.
    if dialect == 'sqlite':
        try:
            # Normalize any legacy uppercase values to lowercase strings
            op.execute("UPDATE booking_requests SET status = lower(status)")
        except Exception:
            pass
        return

    # Ensure enum type exists (no-op if present)
    try:
        status_enum = sa.Enum(
            'pending', 'confirmed', 'completed', 'cancelled', 'draft',
            'pending_quote', 'quote_provided', 'pending_artist_confirmation',
            'request_confirmed', 'request_completed', 'request_declined',
            'request_withdrawn', 'quote_rejected',
            name='bookingstatus'
        )
        status_enum.create(bind, checkfirst=True)
    except Exception:
        pass

    new_values = [
        'draft',
        'pending_quote',
        'quote_provided',
        'pending_artist_confirmation',
        'request_confirmed',
        'request_completed',
        'request_declined',
        'request_withdrawn',
        'quote_rejected',
    ]
    for value in new_values:
        op.execute(sa.text(f"ALTER TYPE bookingstatus ADD VALUE IF NOT EXISTS '{value}'"))

    # Guard: only alter booking_requests if table exists (fresh DBs may not yet have it)
    insp = sa.inspect(bind)
    if 'booking_requests' in insp.get_table_names():
        # Drop existing TEXT default so Postgres can change the column type to enum
        try:
            op.execute("ALTER TABLE booking_requests ALTER COLUMN status DROP DEFAULT")
        except Exception:
            pass
        op.execute(
            "ALTER TABLE booking_requests ALTER COLUMN status TYPE bookingstatus USING status::text::bookingstatus"
        )
        # Re-apply a typed default
        try:
            op.execute("ALTER TABLE booking_requests ALTER COLUMN status SET DEFAULT 'pending_quote'::bookingstatus")
        except Exception:
            pass
        # Drop any legacy enum type if present
        op.execute("DROP TYPE IF EXISTS bookingrequeststatus")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        return
    old_values = [
        'draft',
        'pending_quote',
        'quote_provided',
        'pending_artist_confirmation',
        'request_confirmed',
        'request_completed',
        'request_declined',
        'request_withdrawn',
        'quote_rejected',
    ]
    op.execute(
        "CREATE TYPE bookingrequeststatus AS ENUM ('" + "','".join(old_values) + "')"
    )
    op.execute(
        "ALTER TABLE booking_requests ALTER COLUMN status TYPE bookingrequeststatus USING status::text::bookingrequeststatus"
    )
