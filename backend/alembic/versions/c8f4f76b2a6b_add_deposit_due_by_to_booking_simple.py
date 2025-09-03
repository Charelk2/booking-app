"""add deposit_due_by column to booking_simple

Revision ID: c8f4f76b2a6b
Revises: ae1027e1d3a1
Create Date: 2025-08-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c8f4f76b2a6b'
down_revision: Union[str, None] = 'ae1027e1d3a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if 'bookings_simple' not in insp.get_table_names():
        return
    cols = {c['name'] for c in insp.get_columns('bookings_simple')}
    if 'deposit_due_by' not in cols:
        op.add_column('bookings_simple', sa.Column('deposit_due_by', sa.DateTime(), nullable=True))


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if 'bookings_simple' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('bookings_simple')}
        if 'deposit_due_by' in cols:
            op.drop_column('bookings_simple', 'deposit_due_by')
