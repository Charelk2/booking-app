"""create booking_requests table if missing (bootstrap)

Revision ID: b8d2e4f6a7c8
Revises: 80a1b6c7d8a9
Create Date: 2025-10-09 00:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'b8d2e4f6a7c8'
down_revision: Union[str, None] = '80a1b6c7d8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if 'booking_requests' in insp.get_table_names():
        return

    # Minimal schema compatible with later migrations that alter enums and add indexes
    # Build columns list dynamically so we don't require services table upfront
    cols = [
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('artist_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('attachment_url', sa.String(), nullable=True),
        sa.Column('proposed_datetime_1', sa.DateTime(), nullable=True),
        sa.Column('proposed_datetime_2', sa.DateTime(), nullable=True),
        sa.Column('travel_mode', sa.String(), nullable=True),
        sa.Column('travel_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('travel_breakdown', sa.JSON(), nullable=True),
        # Start with a string status, later migration will unify to enum
        sa.Column('status', sa.String(), nullable=False, server_default='pending_quote'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    ]
    if 'services' in insp.get_table_names():
        cols.insert(3, sa.Column('service_id', sa.Integer(), sa.ForeignKey('services.id', ondelete='CASCADE'), nullable=True))
    else:
        cols.insert(3, sa.Column('service_id', sa.Integer(), nullable=True))

    op.create_table('booking_requests', *cols)


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if 'booking_requests' in insp.get_table_names():
        op.drop_table('booking_requests')
