"""empty message

Revision ID: 959a06e58803
Revises: 20251001_add_outbox_events_table, a8f7e517cfb2
Create Date: 2025-10-24 19:41:27.687034

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '959a06e58803'
down_revision: Union[str, None] = ('20251001_add_outbox_events_table', 'a8f7e517cfb2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
