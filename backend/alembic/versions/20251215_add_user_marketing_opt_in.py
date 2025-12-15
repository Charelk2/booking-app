"""Add users.marketing_opt_in.

Revision ID: 20251215_add_user_marketing_opt_in
Revises: ed57deb9c434
Create Date: 2025-12-15
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20251215_add_user_marketing_opt_in"
down_revision: Union[str, None] = "ed57deb9c434"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "marketing_opt_in",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "marketing_opt_in")

