"""merge heads after reset

Revision ID: c9abfc3aaf86
Revises: b7c1d2e3f4a5, c8f4f76b2a6b
Create Date: 2025-10-09 09:30:23.371823

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9abfc3aaf86'
down_revision: Union[str, None] = ('b7c1d2e3f4a5', 'c8f4f76b2a6b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
