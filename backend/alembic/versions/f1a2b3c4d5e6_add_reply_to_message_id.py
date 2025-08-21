"""Add reply_to_message_id to messages

Revision ID: f1a2b3c4d5e6
Revises: ee99a1b2c3d4
Create Date: 2025-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'ee99a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'messages' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('messages')}
        if 'reply_to_message_id' not in cols:
            op.add_column('messages', sa.Column('reply_to_message_id', sa.Integer(), nullable=True))
        # Best-effort: attempt FK only when supported; safe to ignore on SQLite
        try:
            op.create_foreign_key(
                'fk_messages_reply_to',
                'messages',
                'messages',
                ['reply_to_message_id'],
                ['id'],
            )
        except Exception:
            # SQLite often requires table rebuilds for FKs; skip if unsupported
            pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'messages' in insp.get_table_names():
        try:
            op.drop_constraint('fk_messages_reply_to', 'messages', type_='foreignkey')
        except Exception:
            pass
        cols = {c['name'] for c in insp.get_columns('messages')}
        if 'reply_to_message_id' in cols:
            op.drop_column('messages', 'reply_to_message_id')

