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
    op.add_column('users', sa.Column('mfa_secret', sa.String(), nullable=True))
    op.add_column(
        'users',
        sa.Column('mfa_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute("UPDATE users SET mfa_enabled = 0 WHERE mfa_enabled IS NULL")
    op.alter_column('users', 'mfa_enabled', server_default=None)


def downgrade() -> None:
    op.drop_column('users', 'mfa_enabled')
    op.drop_column('users', 'mfa_secret')
