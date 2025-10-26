"""add_mfa_columns_to_users

Revision ID: 75934d6b3d55
Revises: 662cfa8a683d
Create Date: 2025-07-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '75934d6b3d55'
down_revision: Union[str, None] = '662cfa8a683d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if 'users' not in tables:
        # Create a minimal users table for fresh installs
        op.create_table(
            'users',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('email', sa.String(), nullable=False, unique=True),
            sa.Column('password', sa.String(), nullable=False),
            sa.Column('first_name', sa.String(), nullable=False),
            sa.Column('last_name', sa.String(), nullable=False),
            sa.Column('phone_number', sa.String(), nullable=True),
            sa.Column('user_type', sa.String(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('is_verified', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('profile_picture_url', sa.String(), nullable=True),
        )
        # Add MFA columns
        op.add_column('users', sa.Column('mfa_secret', sa.String(), nullable=True))
        op.add_column('users', sa.Column('mfa_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
        return

    cols = {c['name'] for c in insp.get_columns('users')}
    if 'mfa_secret' not in cols:
        op.add_column('users', sa.Column('mfa_secret', sa.String(), nullable=True))
    if 'mfa_enabled' not in cols:
        op.add_column('users', sa.Column('mfa_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
        try:
            op.execute("UPDATE users SET mfa_enabled = 0 WHERE mfa_enabled IS NULL")
        except Exception:
            pass
        if bind.dialect.name != 'sqlite':
            op.alter_column('users', 'mfa_enabled', server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'users' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('users')}
        if 'mfa_enabled' in cols:
            op.drop_column('users', 'mfa_enabled')
        if 'mfa_secret' in cols:
            op.drop_column('users', 'mfa_secret')
