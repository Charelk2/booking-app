"""update_booking_request_and_quote_status_enums

Revision ID: 3af18e2c6c76
Revises: 18708591c32a
Create Date: 2025-06-03 13:39:25.194203

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3af18e2c6c76'
down_revision: Union[str, None] = '18708591c32a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
