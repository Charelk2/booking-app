"""add media_url to services

Revision ID: 60101124c3b1
Revises: f23ad0e57c1d
Create Date: 2025-10-05 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "60101124c3b1"
down_revision: Union[str, None] = "f23ad0e57c1d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column("media_url", sa.String(), nullable=False, server_default=""),
    )
    op.alter_column("services", "media_url", server_default=None)


def downgrade() -> None:
    op.drop_column("services", "media_url")
