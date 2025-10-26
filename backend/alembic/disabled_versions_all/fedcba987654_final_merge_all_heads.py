"""final merge to unify all outstanding heads

Revision ID: fedcba987654
Revises: fe12ab34cd56, 1e5c92e1a7de
Create Date: 2025-08-18 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'fedcba987654'
down_revision: Union[str, Sequence[str], None] = (
    'fe12ab34cd56',
    '1e5c92e1a7de',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op merge migration to unify parallel branches into a single head.
    pass


def downgrade() -> None:
    # No-op
    pass

