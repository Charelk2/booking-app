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
    op.add_column('messages', sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))


def downgrade() -> None:
    op.drop_column('messages', 'is_read')
