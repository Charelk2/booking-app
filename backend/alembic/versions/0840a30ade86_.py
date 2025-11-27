"""empty message

Revision ID: 0840a30ade86
Revises: 20251001_add_outbox_events_table
Create Date: 2025-10-22 10:27:06.424915

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0840a30ade86'
down_revision: Union[str, None] = '20251001_add_outbox_events_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
