"""merge media_url head into unified master head

Revision ID: def456abc123
Revises: abc123456789, 60101124c3b1
Create Date: 2025-08-18 12:44:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'def456abc123'
down_revision: Union[str, Sequence[str], None] = (
    'abc123456789',
    '60101124c3b1',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op merge to collapse the remaining parallel head into master.
    pass


def downgrade() -> None:
    # No-op
    pass

