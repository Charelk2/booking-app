"""empty message

Revision ID: a8f7e517cfb2
Revises: 0840a30ade86
Create Date: 2025-10-22 10:27:12.749615

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8f7e517cfb2'
down_revision: Union[str, None] = '0840a30ade86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
