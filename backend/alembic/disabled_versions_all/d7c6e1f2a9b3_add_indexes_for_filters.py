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
    """Add indexes for common booking queries without aborting transactions.

    Guard against missing tables and pre-existing indexes by introspecting
    current state before creating.
    """
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    def ensure_index(table: str, name: str, columns: list[str]):
        if table not in tables:
            return
        try:
            existing = {idx['name'] for idx in insp.get_indexes(table)}
        except Exception:
            existing = set()
        if name in existing or op.f(name) in existing:
            return
        op.create_index(op.f(name), table, columns)

    # bookings indexes
    ensure_index('bookings', 'ix_bookings_artist_id', ['artist_id'])
    ensure_index('bookings', 'ix_bookings_status', ['status'])
    ensure_index('bookings', 'ix_bookings_start_time', ['start_time'])

    # booking_requests indexes
    ensure_index('booking_requests', 'ix_booking_requests_artist_id', ['artist_id'])
    ensure_index('booking_requests', 'ix_booking_requests_status', ['status'])
    ensure_index('booking_requests', 'ix_booking_requests_proposed_datetime_1', ['proposed_datetime_1'])
    ensure_index('booking_requests', 'ix_booking_requests_proposed_datetime_2', ['proposed_datetime_2'])


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
