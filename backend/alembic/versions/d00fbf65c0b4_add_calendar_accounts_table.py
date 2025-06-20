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
    op.create_table(
        'calendar_accounts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False, index=True),
        sa.Column('provider', sa.Enum('google', name='calendarprovider'), nullable=False, index=True),
        sa.Column('refresh_token', sa.String(), nullable=False),
        sa.Column('access_token', sa.String(), nullable=False),
        sa.Column('token_expiry', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_calendar_accounts_user_id', 'calendar_accounts', ['user_id'])
    op.create_index('ix_calendar_accounts_provider', 'calendar_accounts', ['provider'])


def downgrade() -> None:
    op.drop_index('ix_calendar_accounts_provider', table_name='calendar_accounts')
    op.drop_index('ix_calendar_accounts_user_id', table_name='calendar_accounts')
    op.drop_table('calendar_accounts')

