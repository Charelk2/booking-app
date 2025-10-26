"""merge heads

Revision ID: 4378675197d5
Revises: 75934d6b3d55, 80a1b6c7d8a9
Create Date: 2025-06-17 10:45:22.043860

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4378675197d5'
down_revision: Union[str, None] = ('75934d6b3d55', '80a1b6c7d8a9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
