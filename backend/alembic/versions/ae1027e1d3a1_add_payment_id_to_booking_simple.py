"""add_payment_id_to_booking_simple

Revision ID: ae1027e1d3a1
Revises: 9b1c0d4a7c3c
Create Date: 2025-07-25 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'ae1027e1d3a1'
down_revision: Union[str, None] = '9b1c0d4a7c3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings_simple', sa.Column('payment_id', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('bookings_simple', 'payment_id')
