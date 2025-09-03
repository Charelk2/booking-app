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
    # Project note: we no longer use the artist_profiles table; migration kept
    # as a no-op to support old branches without breaking fresh installs.
    return
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if 'artist_profiles' not in tables:
        # Create the table if it doesn't exist (fresh installs).
        op.create_table(
            'artist_profiles',
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, nullable=False),
            sa.Column('business_name', sa.String(), nullable=True),
            sa.Column('custom_subtitle', sa.String(), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('location', sa.String(), nullable=True),
            sa.Column('hourly_rate', sa.Numeric(10, 2), nullable=True),
            sa.Column('portfolio_urls', sa.JSON(), nullable=True),
            sa.Column('portfolio_image_urls', sa.JSON(), nullable=True),
            sa.Column('specialties', sa.JSON(), nullable=True),
            sa.Column('profile_picture_url', sa.String(), nullable=True),
            sa.Column('cover_photo_url', sa.String(), nullable=True),
            sa.Column('price_visible', sa.Boolean(), nullable=False, server_default=sa.true()),
        )
        # SQLite doesn't support DROP DEFAULT via ALTER COLUMN; keep model default
        if bind.dialect.name != 'sqlite':
            op.alter_column('artist_profiles', 'price_visible', server_default=None)
        return

    # Table exists: add the column if missing
    cols = {c['name'] for c in insp.get_columns('artist_profiles')}
    if 'price_visible' not in cols:
        op.add_column('artist_profiles', sa.Column('price_visible', sa.Boolean(), nullable=False, server_default=sa.true()))
        op.execute('UPDATE artist_profiles SET price_visible = TRUE')
        if bind.dialect.name != 'sqlite':
            op.alter_column('artist_profiles', 'price_visible', server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'artist_profiles' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('artist_profiles')}
        if 'price_visible' in cols:
            op.drop_column('artist_profiles', 'price_visible')
