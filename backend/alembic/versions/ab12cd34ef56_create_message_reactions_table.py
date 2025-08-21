"""Create message_reactions table

Revision ID: ab12cd34ef56
Revises: f1a2b3c4d5e6
Create Date: 2025-08-21 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'ab12cd34ef56'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'message_reactions' not in insp.get_table_names():
        op.create_table(
            'message_reactions',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('message_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('emoji', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        try:
            op.create_unique_constraint('uq_msg_reaction', 'message_reactions', ['message_id', 'user_id', 'emoji'])
        except Exception:
            pass
        try:
            op.create_index('ix_msg_reaction_message', 'message_reactions', ['message_id'])
        except Exception:
            pass
        # Best-effort FKs (may be skipped on SQLite)
        try:
            op.create_foreign_key('fk_msg_reaction_message', 'message_reactions', 'messages', ['message_id'], ['id'])
        except Exception:
            pass
        try:
            op.create_foreign_key('fk_msg_reaction_user', 'message_reactions', 'users', ['user_id'], ['id'])
        except Exception:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'message_reactions' in insp.get_table_names():
        try:
            op.drop_constraint('fk_msg_reaction_message', 'message_reactions', type_='foreignkey')
        except Exception:
            pass
        try:
            op.drop_constraint('fk_msg_reaction_user', 'message_reactions', type_='foreignkey')
        except Exception:
            pass
        try:
            op.drop_index('ix_msg_reaction_message', table_name='message_reactions')
        except Exception:
            pass
        try:
            op.drop_constraint('uq_msg_reaction', 'message_reactions', type_='unique')
        except Exception:
            pass
        op.drop_table('message_reactions')

