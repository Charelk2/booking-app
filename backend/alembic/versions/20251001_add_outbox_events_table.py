"""
Add outbox_events table for reliable realtime fanout.

Revision ID: 20251001_add_outbox_events_table
Revises: 7b60ccd424e5
Create Date: 2025-10-01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from typing import Union

# revision identifiers, used by Alembic.
revision: str = '20251001_add_outbox_events_table'
down_revision: Union[str, None] = '7b60ccd424e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'outbox_events',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('topic', sa.String(length=255), nullable=False),
        sa.Column('payload_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('due_at', sa.DateTime(timezone=True), nullable=True),
    )
    # Fast scan for undelivered
    op.create_index('ix_outbox_undelivered_created', 'outbox_events', ['delivered_at', 'created_at'])
    # Optional topic lookup
    op.create_index('ix_outbox_topic_delivered', 'outbox_events', ['topic', 'delivered_at'])


def downgrade() -> None:
    op.drop_index('ix_outbox_topic_delivered', table_name='outbox_events')
    op.drop_index('ix_outbox_undelivered_created', table_name='outbox_events')
    op.drop_table('outbox_events')

