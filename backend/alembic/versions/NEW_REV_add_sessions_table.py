"""add sessions table

Revision ID: ed57deb9c434
Revises: b1b2c3d4e5f6
Create Date: 2025-11-10 13:35:22.133244

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ed57deb9c434'
down_revision: Union[str, None] = 'b1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("refresh_token_hash", sa.String(length=128), nullable=True),
        sa.Column("refresh_token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("refresh_jti", sa.String(length=64), nullable=True),
        sa.Column("prev_refresh_token_hash", sa.String(length=128), nullable=True),
        sa.Column("prev_rotated_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index(
        "ix_sessions_refresh_jti", "sessions", ["refresh_jti"], unique=True
    )
    op.create_index(
        "ix_sessions_refresh_hash", "sessions", ["refresh_token_hash"]
    )
    op.create_index("ix_sessions_revoked_at", "sessions", ["revoked_at"])


def downgrade() -> None:
    op.drop_index("ix_sessions_revoked_at", table_name="sessions")
    op.drop_index("ix_sessions_refresh_hash", table_name="sessions")
    op.drop_index("ix_sessions_refresh_jti", table_name="sessions")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
