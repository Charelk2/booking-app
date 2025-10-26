"""empty message

Revision ID: 0840a30ade86
Revises: 7b60ccd424e5
Create Date: 2025-10-22 10:27:06.424915

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0840a30ade86'
down_revision: Union[str, None] = '7b60ccd424e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
