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
    op.add_column('bookings_simple', sa.Column('deposit_amount', sa.Numeric(10, 2), nullable=True))
    op.add_column(
        'bookings_simple',
        sa.Column('deposit_paid', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute("UPDATE bookings_simple SET deposit_paid = FALSE")
    op.alter_column('bookings_simple', 'deposit_paid', server_default=None)


def downgrade() -> None:
    op.drop_column('bookings_simple', 'deposit_paid')
    op.drop_column('bookings_simple', 'deposit_amount')
