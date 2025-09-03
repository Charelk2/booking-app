"""add action column to messages

Revision ID: e0069045b94f
Revises: f23ad0e57c1d
Create Date: 2025-08-06 12:03:03.870245

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e0069045b94f'
down_revision: Union[str, None] = 'f23ad0e57c1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the action column to the messages table."""
    action_enum = sa.Enum(
        "review_quote",
        "view_booking_details",
        name="messageaction",
    )
    action_enum.create(op.get_bind(), checkfirst=True)
    op.add_column("messages", sa.Column("action", action_enum, nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "action")
    op.execute("DROP TYPE IF EXISTS messageaction")
