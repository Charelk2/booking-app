"""
Add event_type and guests_count to event_preps

Revision ID: 20250823_01_add_event_type_guests
Revises: ee99a1b2c3d4_rename_artist_profiles_to_service_provider_profiles
Create Date: 2025-08-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '20250823_01_add_event_type_guests'
down_revision = 'ee99a1b2c3d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table('event_preps'):
        # Create the event_preps table if it doesn't exist (fresh databases)
        op.create_table(
            'event_preps',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('booking_id', sa.Integer(), sa.ForeignKey('bookings.id', ondelete='CASCADE'), nullable=False, unique=True),
            sa.Column('day_of_contact_name', sa.String(), nullable=True),
            sa.Column('day_of_contact_phone', sa.String(), nullable=True),
            sa.Column('venue_address', sa.String(), nullable=True),
            sa.Column('venue_place_id', sa.String(), nullable=True),
            sa.Column('venue_lat', sa.Numeric(12, 6), nullable=True),
            sa.Column('venue_lng', sa.Numeric(12, 6), nullable=True),
            sa.Column('loadin_start', sa.Time(), nullable=True),
            sa.Column('loadin_end', sa.Time(), nullable=True),
            sa.Column('soundcheck_time', sa.Time(), nullable=True),
            sa.Column('guests_arrival_time', sa.Time(), nullable=True),
            sa.Column('performance_start_time', sa.Time(), nullable=True),
            sa.Column('performance_end_time', sa.Time(), nullable=True),
            sa.Column('tech_owner', sa.String(), nullable=False, server_default=sa.text("'venue'")),
            sa.Column('stage_power_confirmed', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('accommodation_required', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('accommodation_address', sa.String(), nullable=True),
            sa.Column('accommodation_contact', sa.String(), nullable=True),
            sa.Column('accommodation_notes', sa.String(), nullable=True),
            sa.Column('notes', sa.String(), nullable=True),
            sa.Column('schedule_notes', sa.String(), nullable=True),
            sa.Column('parking_access_notes', sa.String(), nullable=True),
            sa.Column('event_type', sa.String(), nullable=True),
            sa.Column('guests_count', sa.Integer(), nullable=True),
            sa.Column('progress_cached', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('booking_id', name='uq_event_preps_booking_id'),
        )
        op.create_index('ix_event_preps_booking_id', 'event_preps', ['booking_id'], unique=True)
    else:
        # Table exists; add columns if missing
        cols = {c['name'] for c in insp.get_columns('event_preps')}
        with op.batch_alter_table('event_preps') as batch_op:
            if 'event_type' not in cols:
                batch_op.add_column(sa.Column('event_type', sa.String(), nullable=True))
            if 'guests_count' not in cols:
                batch_op.add_column(sa.Column('guests_count', sa.Integer(), nullable=True))

    # Create auxiliary tables if they don't exist yet (used by Event Prep features)
    if not insp.has_table('event_prep_attachments'):
        op.create_table(
            'event_prep_attachments',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('event_prep_id', sa.Integer(), sa.ForeignKey('event_preps.id', ondelete='CASCADE'), nullable=False),
            sa.Column('file_url', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_event_prep_attachments_event_prep_id', 'event_prep_attachments', ['event_prep_id'])

    if not insp.has_table('event_prep_idempotency'):
        op.create_table(
            'event_prep_idempotency',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('booking_id', sa.Integer(), sa.ForeignKey('bookings.id', ondelete='CASCADE'), nullable=False),
            sa.Column('key_hash', sa.String(), nullable=False),
            sa.Column('request_hash', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('booking_id', 'key_hash', name='uq_event_prep_idem_booking_key'),
        )
        op.create_index('ix_event_prep_idem_booking_id', 'event_prep_idempotency', ['booking_id'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if insp.has_table('event_preps'):
        cols = {c['name'] for c in insp.get_columns('event_preps')}
        with op.batch_alter_table('event_preps') as batch_op:
            if 'guests_count' in cols:
                batch_op.drop_column('guests_count')
            if 'event_type' in cols:
                batch_op.drop_column('event_type')
