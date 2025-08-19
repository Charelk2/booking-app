"""merge heads after system_key and auth refresh additions

Revision ID: fe12ab34cd56
Revises: a1f3e2d4c6b7, 01dc14acc6a1, 05c00e13a615, 1a2b3c4d5e6f
Create Date: 2025-08-18 12:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'fe12ab34cd56'
down_revision: Union[str, Sequence[str], None] = (
    'a1f3e2d4c6b7',
    '01dc14acc6a1',
    '05c00e13a615',
    '1a2b3c4d5e6f',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op merge migration to unify multiple heads
    pass


def downgrade() -> None:
    # No-op
    pass

