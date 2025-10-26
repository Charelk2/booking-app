"""add expires_at column to messages

Revision ID: b9ce27413121
Revises: e0069045b94f
Create Date: 2025-08-06 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b9ce27413121'
down_revision: Union[str, None] = 'e0069045b94f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add expires_at column to the messages table."""
    op.add_column("messages", sa.Column("expires_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "expires_at")
