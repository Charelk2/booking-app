"""unify all current heads into a single head

Revision ID: abc123456789
Revises: fe12ab34cd56, fedcba987654, a1f3e2d4c6b7, 1a2b3c4d5e6f, 1e5c92e1a7de, 05c00e13a615, 01dc14acc6a1
Create Date: 2025-08-18 12:36:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'abc123456789'
down_revision: Union[str, Sequence[str], None] = (
    'fe12ab34cd56',
    'fedcba987654',
    'a1f3e2d4c6b7',
    '1a2b3c4d5e6f',
    '1e5c92e1a7de',
    '05c00e13a615',
    '01dc14acc6a1',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op merge migration; consolidates parallel heads.
    pass


def downgrade() -> None:
    # No-op
    pass

