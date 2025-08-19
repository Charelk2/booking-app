"""add is_read column to messages

Revision ID: 1e5c92e1a7de
Revises: 8ab844044580
Create Date: 2025-09-02 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '1e5c92e1a7de'
down_revision: Union[str, None] = '8ab844044580'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if 'messages' not in tables:
        # Create a minimal messages table so subsequent migrations can add fields
        op.create_table(
            'messages',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('message_type', sa.String(), nullable=False, server_default='USER'),
        )
        # Add is_read at creation for fresh DBs
        op.add_column('messages', sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))
        if bind.dialect.name != 'sqlite':
            op.alter_column('messages', 'message_type', server_default=None)
        return

    cols = {c['name'] for c in insp.get_columns('messages')}
    if 'is_read' not in cols:
        op.add_column('messages', sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'messages' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('messages')}
        if 'is_read' in cols:
            op.drop_column('messages', 'is_read')
