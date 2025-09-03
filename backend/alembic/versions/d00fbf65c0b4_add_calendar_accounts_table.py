"""add calendar_accounts table

Revision ID: d00fbf65c0b4
Revises: c8f4f76b2a6b
Create Date: 2025-08-10 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd00fbf65c0b4'
down_revision: Union[str, None] = 'c8f4f76b2a6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if 'calendar_accounts' not in tables:
        op.create_table(
            'calendar_accounts',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('provider', sa.Enum('google', name='calendarprovider'), nullable=False),
            sa.Column('refresh_token', sa.String(), nullable=False),
            sa.Column('access_token', sa.String(), nullable=False),
            sa.Column('token_expiry', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        )
    # Create indexes if not present; guard against duplicates
    try:
        op.create_index('ix_calendar_accounts_user_id', 'calendar_accounts', ['user_id'])
    except Exception:
        pass
    try:
        op.create_index('ix_calendar_accounts_provider', 'calendar_accounts', ['provider'])
    except Exception:
        pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'calendar_accounts' in insp.get_table_names():
        try:
            op.drop_index('ix_calendar_accounts_provider', table_name='calendar_accounts')
        except Exception:
            pass
        try:
            op.drop_index('ix_calendar_accounts_user_id', table_name='calendar_accounts')
        except Exception:
            pass
        op.drop_table('calendar_accounts')
