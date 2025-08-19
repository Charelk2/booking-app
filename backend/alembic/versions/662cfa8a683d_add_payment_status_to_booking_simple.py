"""add_payment_status_to_booking_simple

Revision ID: 662cfa8a683d
Revises: 4b9e2a61d4b1
Create Date: 2025-07-15 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '662cfa8a683d'
down_revision: Union[str, None] = '4b9e2a61d4b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    # Create table if missing (fresh installs)
    if 'bookings_simple' not in tables:
        op.create_table(
            'bookings_simple',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('payment_status', sa.String(), nullable=False, server_default='pending'),
        )
        # SQLite: keep the default; on other DBs, drop default to use model default
        if bind.dialect.name != 'sqlite':
            op.alter_column('bookings_simple', 'payment_status', server_default=None)
        return

    # Table exists: add column if missing
    cols = {c['name'] for c in insp.get_columns('bookings_simple')}
    if 'payment_status' not in cols:
        op.add_column(
            'bookings_simple',
            sa.Column('payment_status', sa.String(), nullable=False, server_default='pending'),
        )
        try:
            op.execute("UPDATE bookings_simple SET payment_status = 'pending'")
        except Exception:
            pass
        if bind.dialect.name != 'sqlite':
            op.alter_column('bookings_simple', 'payment_status', server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'bookings_simple' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('bookings_simple')}
        if 'payment_status' in cols:
            op.drop_column('bookings_simple', 'payment_status')
