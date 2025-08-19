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
    insp = sa.inspect(op.get_bind())
    if 'bookings_simple' not in insp.get_table_names():
        return
    cols = {c['name'] for c in insp.get_columns('bookings_simple')}
    if 'payment_id' not in cols:
        op.add_column('bookings_simple', sa.Column('payment_id', sa.String(), nullable=True))


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if 'bookings_simple' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('bookings_simple')}
        if 'payment_id' in cols:
            op.drop_column('bookings_simple', 'payment_id')
