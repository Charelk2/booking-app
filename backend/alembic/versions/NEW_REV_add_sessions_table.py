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


# ---------------------------------------------------------------------------
# Manual schema notes (ed57deb9c434 baseline)
#
# 2025-11-27:
#   On production appdb at revision ed57deb9c434 (this file), we manually added
#   booking_requests.parent_booking_request_id with:
#     ALTER TABLE booking_requests
#       ADD COLUMN parent_booking_request_id integer;
#     CREATE INDEX ix_booking_requests_parent_booking_request_id
#       ON booking_requests (parent_booking_request_id);
#     ALTER TABLE booking_requests
#       ADD CONSTRAINT fk_booking_requests_parent_booking_request_id
#       FOREIGN KEY (parent_booking_request_id)
#       REFERENCES booking_requests(id)
#       ON DELETE SET NULL;
#   This change is not represented as an Alembic upgrade step; it is tracked
#   here and in AGENTS.md so future manual DB changes at this baseline can
#   follow the same pattern.
#
# 2026-01-02:
#   On production appdb at revision ed57deb9c434 (this file), add an index to
#   speed provider rating aggregates on the reviews table:
#     CREATE INDEX ix_reviews_artist_id ON reviews (artist_id);
#   This is manual-only (no Alembic upgrade); also recorded in AGENTS.md.
#
# 2026-01-10:
#   On production appdb at revision ed57deb9c434 (this file), add optional
#   geocoded coordinates for the provider base location so that artist lists
#   can be ordered by proximity ("Closest first") without changing the
#   existing human-readable `location` field:
#     ALTER TABLE service_provider_profiles
#       ADD COLUMN location_lat numeric(9, 6) NULL;
#     ALTER TABLE service_provider_profiles
#       ADD COLUMN location_lng numeric(9, 6) NULL;
#     CREATE INDEX ix_service_provider_profiles_location_lat
#       ON service_provider_profiles (location_lat);
#     CREATE INDEX ix_service_provider_profiles_location_lng
#       ON service_provider_profiles (location_lng);
#   This change is manual-only (no Alembic upgrade step). When recreating
#   appdb at this revision, re-apply the same DDL before deploying any code
#   that reads or writes these columns.
