"""add_deposit_columns_to_booking_simple

Revision ID: 80a1b6c7d8a9
Revises: 662cfa8a683d
Create Date: 2025-07-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '80a1b6c7d8a9'
down_revision: Union[str, None] = '662cfa8a683d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'bookings_simple' not in insp.get_table_names():
        # Table created in a prior migration guard; nothing to add yet.
        return
    cols = {c['name'] for c in insp.get_columns('bookings_simple')}
    if 'deposit_amount' not in cols:
        op.add_column('bookings_simple', sa.Column('deposit_amount', sa.Numeric(10, 2), nullable=True))
    if 'deposit_paid' not in cols:
        op.add_column(
            'bookings_simple',
            sa.Column('deposit_paid', sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        try:
            op.execute("UPDATE bookings_simple SET deposit_paid = FALSE")
        except Exception:
            pass
        if bind.dialect.name != 'sqlite':
            op.alter_column('bookings_simple', 'deposit_paid', server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'bookings_simple' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('bookings_simple')}
        if 'deposit_paid' in cols:
            op.drop_column('bookings_simple', 'deposit_paid')
        if 'deposit_amount' in cols:
            op.drop_column('bookings_simple', 'deposit_amount')
