"""Add parent_booking_request_id to booking_requests.

Revision ID: 20251127_add_parent_booking_request_id
Revises: 0840a30ade86
Create Date: 2025-11-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20251127_add_parent_booking_request_id"
# Attach this migration to the latest existing head so the graph remains
# linear in production deployments.
down_revision: Union[str, None] = "ed57deb9c434"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "booking_requests",
        sa.Column("parent_booking_request_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_booking_requests_parent_booking_request_id",
        "booking_requests",
        ["parent_booking_request_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_booking_requests_parent_booking_request_id",
        "booking_requests",
        "booking_requests",
        ["parent_booking_request_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_booking_requests_parent_booking_request_id",
        "booking_requests",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_booking_requests_parent_booking_request_id",
        table_name="booking_requests",
    )
    op.drop_column("booking_requests", "parent_booking_request_id")
