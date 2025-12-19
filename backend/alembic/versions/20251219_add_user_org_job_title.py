"""Add organization + job_title to users.

Revision ID: 20251219_add_user_org_job_title
Revises: 470ff4da3817
Create Date: 2025-12-19
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20251219_add_user_org_job_title"
down_revision: Union[str, None] = "470ff4da3817"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(bind, table: str, col: str) -> bool:
    try:
        insp = sa.inspect(bind)
        existing = {c.get("name") for c in insp.get_columns(table)}
        return col in existing
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    with op.batch_alter_table("users") as batch_op:
        if not _has_column(bind, "users", "organization"):
            batch_op.add_column(sa.Column("organization", sa.String(length=255), nullable=True))
        if not _has_column(bind, "users", "job_title"):
            batch_op.add_column(sa.Column("job_title", sa.String(length=255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    with op.batch_alter_table("users") as batch_op:
        if _has_column(bind, "users", "job_title"):
            batch_op.drop_column("job_title")
        if _has_column(bind, "users", "organization"):
            batch_op.drop_column("organization")

