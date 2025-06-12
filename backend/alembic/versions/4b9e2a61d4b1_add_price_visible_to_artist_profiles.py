"""add_price_visible_to_artist_profiles

Revision ID: 4b9e2a61d4b1
Revises: 3af18e2c6c76
Create Date: 2025-07-02 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '4b9e2a61d4b1'
down_revision: Union[str, None] = '3af18e2c6c76'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('artist_profiles', sa.Column('price_visible', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute('UPDATE artist_profiles SET price_visible = TRUE')
    op.alter_column('artist_profiles', 'price_visible', server_default=None)


def downgrade() -> None:
    op.drop_column('artist_profiles', 'price_visible')
