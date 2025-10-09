"""create quotes_v2 table if missing

Revision ID: b0a1c2d3e4f5
Revises: 80a1b6c7d8a9
Create Date: 2025-10-08 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b0a1c2d3e4f5'
down_revision: Union[str, None] = '80a1b6c7d8a9'
branch_labels: Union[str, Sequence[str], None] = None
# Ensure booking_requests exists before creating FK to it
depends_on: Union[str, Sequence[str], None] = ('b8d2e4f6a7c8',)


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table('quotes_v2'):
        # Ensure supporting enums exist on Postgres; SQLite treats as TEXT
        quote_status_enum_create = postgresql.ENUM('pending', 'accepted', 'rejected', 'expired', name='quotestatusv2')
        try:
            quote_status_enum_create.create(bind, checkfirst=True)
        except Exception:
            pass

        # Non-creating reference for column type
        quote_status_enum = postgresql.ENUM('pending', 'accepted', 'rejected', 'expired', name='quotestatusv2', create_type=False)

        op.create_table(
            'quotes_v2',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('booking_request_id', sa.Integer(), sa.ForeignKey('booking_requests.id'), nullable=False),
            sa.Column('artist_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('client_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('services', sa.JSON(), nullable=False),
            sa.Column('sound_fee', sa.Numeric(10, 2), nullable=False, server_default='0'),
            sa.Column('sound_firm', sa.String(), nullable=True),
            sa.Column('travel_fee', sa.Numeric(10, 2), nullable=False, server_default='0'),
            sa.Column('accommodation', sa.String(), nullable=True),
            sa.Column('subtotal', sa.Numeric(10, 2), nullable=False, server_default='0'),
            sa.Column('discount', sa.Numeric(10, 2), nullable=True),
            sa.Column('total', sa.Numeric(10, 2), nullable=False, server_default='0'),
            sa.Column('status', quote_status_enum, nullable=False, server_default='pending'),
            sa.Column('expires_at', sa.DateTime(), nullable=True),
        )
        # Drop server defaults on non-SQLite to align with ORM defaults
        if bind.dialect.name != 'sqlite':
            try:
                op.alter_column('quotes_v2', 'sound_fee', server_default=None)
                op.alter_column('quotes_v2', 'travel_fee', server_default=None)
                op.alter_column('quotes_v2', 'subtotal', server_default=None)
                op.alter_column('quotes_v2', 'total', server_default=None)
                op.alter_column('quotes_v2', 'status', server_default=None)
            except Exception:
                pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if insp.has_table('quotes_v2'):
        op.drop_table('quotes_v2')
    # Leave enum type in place to avoid breaking older rows if any
