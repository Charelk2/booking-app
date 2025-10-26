"""merge all heads after reset

Revision ID: 5831ac500830
Revises: 20250920_add_messages_request_id_id_index, b0a1c2d3e4f5, b8d2e4f6a7c8, c9abfc3aaf86
Create Date: 2025-10-09 11:07:27.547221

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5831ac500830'
down_revision: Union[str, None] = ('20250920_add_messages_request_id_id_index', 'b0a1c2d3e4f5', 'b8d2e4f6a7c8', 'c9abfc3aaf86')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
