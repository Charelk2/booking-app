"""add email column to calendar_accounts

Revision ID: 7cc87c0e1510
Revises: d00fbf65c0b4
Create Date: 2025-08-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '7cc87c0e1510'
down_revision: Union[str, None] = 'd00fbf65c0b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('calendar_accounts', sa.Column('email', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('calendar_accounts', 'email')
