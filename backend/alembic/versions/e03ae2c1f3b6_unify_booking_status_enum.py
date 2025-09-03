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
depends_on: Union[str, Sequence[str], None] = None


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

    op.execute(
        "ALTER TABLE booking_requests ALTER COLUMN status TYPE bookingstatus USING status::text::bookingstatus"
    )
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
