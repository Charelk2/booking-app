"""add indexes for frequent filters

Revision ID: d7c6e1f2a9b3
Revises: b9ce27413121
Create Date: 2025-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd7c6e1f2a9b3'
down_revision: Union[str, None] = 'b9ce27413121'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add indexes for common booking queries."""
    op.create_index(op.f('ix_bookings_artist_id'), 'bookings', ['artist_id'])
    op.create_index(op.f('ix_bookings_status'), 'bookings', ['status'])
    op.create_index(op.f('ix_bookings_start_time'), 'bookings', ['start_time'])
    op.create_index(op.f('ix_booking_requests_artist_id'), 'booking_requests', ['artist_id'])
    op.create_index(op.f('ix_booking_requests_status'), 'booking_requests', ['status'])
    op.create_index(op.f('ix_booking_requests_proposed_datetime_1'), 'booking_requests', ['proposed_datetime_1'])
    op.create_index(op.f('ix_booking_requests_proposed_datetime_2'), 'booking_requests', ['proposed_datetime_2'])


def downgrade() -> None:
    op.drop_index(op.f('ix_booking_requests_proposed_datetime_2'), table_name='booking_requests')
    op.drop_index(op.f('ix_booking_requests_proposed_datetime_1'), table_name='booking_requests')
    op.drop_index(op.f('ix_booking_requests_status'), table_name='booking_requests')
    op.drop_index(op.f('ix_booking_requests_artist_id'), table_name='booking_requests')
    op.drop_index(op.f('ix_bookings_start_time'), table_name='bookings')
    op.drop_index(op.f('ix_bookings_status'), table_name='bookings')
    op.drop_index(op.f('ix_bookings_artist_id'), table_name='bookings')
