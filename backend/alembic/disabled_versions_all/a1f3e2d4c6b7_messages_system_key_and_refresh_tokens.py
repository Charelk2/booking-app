"""Add messages.system_key with unique constraint, backfill+dedupe; add indexes; add user refresh columns

Revision ID: a1f3e2d4c6b7
Revises: d7c6e1f2a9b3
Create Date: 2025-08-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1f3e2d4c6b7'
down_revision: Union[str, None] = 'd7c6e1f2a9b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1) messages.system_key + constraints/indexes (guarded, idempotent)
    if 'messages' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('messages')}
        if 'system_key' not in cols:
            op.add_column('messages', sa.Column('system_key', sa.String(), nullable=True))
        # Simple index on system_key
        existing_msg_indexes = {idx['name'] for idx in insp.get_indexes('messages')}
        if 'ix_messages_system_key' not in existing_msg_indexes and op.f('ix_messages_system_key') not in existing_msg_indexes:
            op.create_index('ix_messages_system_key', 'messages', ['system_key'])
        # Composite indexes only if requisite columns exist
        if {'booking_request_id', 'timestamp'}.issubset(cols):
            if 'ix_messages_request_time' not in existing_msg_indexes and op.f('ix_messages_request_time') not in existing_msg_indexes:
                op.create_index('ix_messages_request_time', 'messages', ['booking_request_id', 'timestamp'])
        if {'booking_request_id', 'message_type', 'timestamp'}.issubset(cols):
            if 'ix_messages_request_type_time' not in existing_msg_indexes and op.f('ix_messages_request_type_time') not in existing_msg_indexes:
                op.create_index('ix_messages_request_type_time', 'messages', ['booking_request_id', 'message_type', 'timestamp'])
        # Unique constraint for dedupe only if booking_request_id exists
        if 'booking_request_id' in cols:
            # Check existing constraints to avoid duplicate creation
            existing_constraints = []
            try:
                res = bind.exec_driver_sql(
                    """
                    SELECT conname FROM pg_constraint c
                    JOIN pg_class t ON t.oid = c.conrelid
                    JOIN pg_namespace n ON n.oid = t.relnamespace
                    WHERE t.relname = 'messages' AND n.nspname = current_schema()
                    """
                )
                existing_constraints = [r[0] for r in res.fetchall()]
            except Exception:
                existing_constraints = []
            if 'uq_messages_request_system_key' not in existing_constraints:
                op.create_unique_constraint('uq_messages_request_system_key', 'messages', ['booking_request_id', 'system_key'])
        # Backfill system_key for booking details summary messages (only if 'content' column exists)
        if 'content' in cols:
            try:
                op.execute(
                    """
                    UPDATE messages
                    SET system_key = 'booking_details_v1'
                    WHERE (message_type = 'SYSTEM' OR upper(message_type) = 'SYSTEM')
                      AND system_key IS NULL
                      AND content LIKE 'Booking details:%'
                    """
                )
            except Exception:
                pass
        # Dedupe only when booking_request_id exists
        if 'booking_request_id' in cols:
            try:
                op.execute(
                    """
                    DELETE FROM messages
                    WHERE system_key IS NOT NULL
                      AND id NOT IN (
                        SELECT MIN(id) FROM messages
                        WHERE system_key IS NOT NULL
                        GROUP BY booking_request_id, system_key
                      )
                    """
                )
            except Exception:
                pass

    # 2) notifications composite index for thread grouping
    if 'notifications' in insp.get_table_names():
        existing_notif_indexes = {idx['name'] for idx in insp.get_indexes('notifications')}
        if 'ix_notifications_user_type_read_time' not in existing_notif_indexes and op.f('ix_notifications_user_type_read_time') not in existing_notif_indexes:
            op.create_index(
                'ix_notifications_user_type_read_time',
                'notifications',
                ['user_id', 'type', 'is_read', 'timestamp']
            )

    # 3) user refresh token/session hardening
    if 'users' in insp.get_table_names():
        user_cols = {c['name'] for c in insp.get_columns('users')}
        if 'refresh_token_hash' not in user_cols:
            op.add_column('users', sa.Column('refresh_token_hash', sa.String(), nullable=True))
        if 'refresh_token_expires_at' not in user_cols:
            op.add_column('users', sa.Column('refresh_token_expires_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    # users
    if 'users' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('users')}
        if 'refresh_token_expires_at' in cols:
            op.drop_column('users', 'refresh_token_expires_at')
        if 'refresh_token_hash' in cols:
            op.drop_column('users', 'refresh_token_hash')

    # notifications index
    if 'notifications' in insp.get_table_names():
        try:
            op.drop_index('ix_notifications_user_type_read_time', table_name='notifications')
        except Exception:
            pass

    # messages
    if 'messages' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('messages')}
        try:
            op.drop_constraint('uq_messages_request_system_key', 'messages', type_='unique')
        except Exception:
            pass
        for idx in ['ix_messages_request_type_time', 'ix_messages_request_time', 'ix_messages_system_key']:
            try:
                op.drop_index(idx, table_name='messages')
            except Exception:
                pass
        if 'system_key' in cols:
            op.drop_column('messages', 'system_key')
