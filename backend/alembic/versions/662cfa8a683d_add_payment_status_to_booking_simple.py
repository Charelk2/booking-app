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
    op.add_column(
        'bookings_simple',
        sa.Column('payment_status', sa.String(), nullable=False, server_default='pending'),
    )
    op.execute("UPDATE bookings_simple SET payment_status = 'pending'")
    op.alter_column('bookings_simple', 'payment_status', server_default=None)


def downgrade() -> None:
    op.drop_column('bookings_simple', 'payment_status')
