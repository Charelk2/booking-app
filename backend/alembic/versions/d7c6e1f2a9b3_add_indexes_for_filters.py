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
    """Add indexes for common booking queries (guarded for SQLite/missing tables)."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if 'bookings' in tables:
        try:
            op.create_index(op.f('ix_bookings_artist_id'), 'bookings', ['artist_id'])
        except Exception:
            pass
        try:
            op.create_index(op.f('ix_bookings_status'), 'bookings', ['status'])
        except Exception:
            pass
        try:
            op.create_index(op.f('ix_bookings_start_time'), 'bookings', ['start_time'])
        except Exception:
            pass

    if 'booking_requests' in tables:
        for idx_name, col in [
            ('ix_booking_requests_artist_id', 'artist_id'),
            ('ix_booking_requests_status', 'status'),
            ('ix_booking_requests_proposed_datetime_1', 'proposed_datetime_1'),
            ('ix_booking_requests_proposed_datetime_2', 'proposed_datetime_2'),
        ]:
            try:
                op.create_index(op.f(idx_name), 'booking_requests', [col])
            except Exception:
                pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    # Drop quietly if present
    if 'booking_requests' in insp.get_table_names():
        for idx in [
            op.f('ix_booking_requests_proposed_datetime_2'),
            op.f('ix_booking_requests_proposed_datetime_1'),
            op.f('ix_booking_requests_status'),
            op.f('ix_booking_requests_artist_id'),
        ]:
            try:
                op.drop_index(idx, table_name='booking_requests')
            except Exception:
                pass
    if 'bookings' in insp.get_table_names():
        for idx in [
            op.f('ix_bookings_start_time'),
            op.f('ix_bookings_status'),
            op.f('ix_bookings_artist_id'),
        ]:
            try:
                op.drop_index(idx, table_name='bookings')
            except Exception:
                pass
