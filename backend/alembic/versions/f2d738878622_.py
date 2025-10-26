"""empty message

Revision ID: f2d738878622
Revises: 959a06e58803
Create Date: 2025-10-24 22:08:18.091002

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2d738878622'
down_revision: Union[str, None] = '959a06e58803'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
