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
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if 'services' not in tables:
        # Minimal services table for fresh installs; other migrations add more columns
        op.create_table('services', sa.Column('id', sa.Integer(), primary_key=True))
    cols = {c['name'] for c in insp.get_columns('services')}
    if 'media_url' not in cols:
        op.add_column(
            "services",
            sa.Column("media_url", sa.String(), nullable=False, server_default=""),
        )
        # SQLite cannot drop defaults via ALTER COLUMN
        if bind.dialect.name != 'sqlite':
            op.alter_column("services", "media_url", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'services' in insp.get_table_names():
        cols = {c['name'] for c in insp.get_columns('services')}
        if 'media_url' in cols:
            op.drop_column("services", "media_url")
