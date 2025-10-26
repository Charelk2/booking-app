"""create bookings table if missing (aligns with models/booking.py)

Revision ID: b7c1d2e3f4a5
Revises: c8f4f76b2a6b
Create Date: 2025-10-09 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, None] = 'c8f4f76b2a6b'
branch_labels: Union[str, Sequence[str], None] = None
# Prefer services to exist first (60101124c3b1 can create it if missing)
depends_on: Union[str, Sequence[str], None] = ('60101124c3b1',)


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if 'bookings' in insp.get_table_names():
        return

    # Create bookingstatus enum for Postgres; SQLite treats as TEXT
    booking_status_values = [
        'pending', 'confirmed', 'completed', 'cancelled', 'draft',
        'pending_quote', 'quote_provided', 'pending_artist_confirmation',
        'request_confirmed', 'request_completed', 'request_declined',
        'request_withdrawn', 'quote_rejected', 'pending_sound', 'failed_no_sound'
    ]
    status_enum = postgresql.ENUM(*booking_status_values, name='bookingstatus')
    try:
        status_enum.create(bind, checkfirst=True)
    except Exception:
        pass

    # We reference users and optionally services (if present). Avoid FK to quotes.
    cols = [
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('artist_id', sa.Integer(), sa.ForeignKey('users.id'), index=True, nullable=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('start_time', sa.DateTime(), nullable=True, index=True),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        # Avoid re-creating enum during table creation
        sa.Column('status', postgresql.ENUM(*booking_status_values, name='bookingstatus', create_type=False), nullable=True),
        sa.Column('total_price', sa.Numeric(10, 2), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('event_city', sa.String(), nullable=True),
        sa.Column('artist_accept_deadline_at', sa.DateTime(), nullable=True),
        sa.Column('quote_id', sa.Integer(), nullable=True),
    ]
    if 'services' in insp.get_table_names():
        cols.insert(3, sa.Column('service_id', sa.Integer(), sa.ForeignKey('services.id', ondelete='CASCADE'), nullable=True))
    else:
        cols.insert(3, sa.Column('service_id', sa.Integer(), nullable=True))

    op.create_table('bookings', *cols)


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if 'bookings' in insp.get_table_names():
        op.drop_table('bookings')
    # Leave enum to avoid type dependency on other tables that may reference it
