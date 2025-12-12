"""Phase A PV v2 schema prep.

Revision ID: 470ff4da3817
Revises: ed57deb9c434
Create Date: 2025-12-12

Adds linkage/type columns to bookings_simple, internal flag to quotes_v2,
extends disputes to reference bookings_simple, and adds a Postgres-only partial
GIN index for PV payloads in booking_requests.service_extras.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "470ff4da3817"
down_revision: Union[str, None] = "ed57deb9c434"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_pg(bind) -> bool:
    try:
        return (getattr(bind.dialect, "name", "").lower() == "postgresql")
    except Exception:
        return False


def _table_exists(bind, table_name: str) -> bool:
    try:
        insp = sa.inspect(bind)
        return table_name in insp.get_table_names()
    except Exception:
        return False


def _columns_exist(bind, table: str, cols: list[str]) -> bool:
    try:
        if not _is_pg(bind):
            return False
        rows = bind.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = :t
                """
            ),
            {"t": table},
        ).fetchall()
        existing = {str(r[0]) for r in rows}
        return all(c in existing for c in cols)
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    # 1) bookings_simple: add booking_request_id + booking_type + indexes
    if _table_exists(bind, "bookings_simple"):
        op.add_column(
            "bookings_simple",
            sa.Column(
                "booking_request_id",
                sa.Integer(),
                sa.ForeignKey("booking_requests.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.add_column(
            "bookings_simple",
            sa.Column(
                "booking_type",
                sa.String(length=64),
                nullable=False,
                server_default=sa.text("'standard'"),
            ),
        )
        op.create_index(
            "ix_bookings_simple_booking_request_id",
            "bookings_simple",
            ["booking_request_id"],
        )
        op.create_index(
            "ix_bookings_simple_booking_type",
            "bookings_simple",
            ["booking_type"],
        )

        # Backfill linkage + normalize booking_type
        if _is_pg(bind):
            op.execute(
                """
                UPDATE bookings_simple bs
                SET booking_request_id = q.booking_request_id,
                    booking_type = COALESCE(bs.booking_type, 'standard')
                FROM quotes_v2 q
                WHERE bs.quote_id = q.id
                  AND bs.booking_request_id IS NULL;
                """
            )
        else:
            # SQLite doesn't support UPDATE ... FROM
            op.execute(
                """
                UPDATE bookings_simple
                SET booking_request_id = (
                    SELECT booking_request_id
                    FROM quotes_v2 q
                    WHERE q.id = bookings_simple.quote_id
                )
                WHERE booking_request_id IS NULL;
                """
            )
        op.execute(
            """
            UPDATE bookings_simple
            SET booking_type = 'standard'
            WHERE booking_type IS NULL OR booking_type = '';
            """
        )

    # 2) quotes_v2: add is_internal
    if _table_exists(bind, "quotes_v2"):
        op.add_column(
            "quotes_v2",
            sa.Column(
                "is_internal",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )
        op.create_index(
            "ix_quotes_v2_is_internal",
            "quotes_v2",
            ["is_internal"],
        )

    # 3) disputes: booking_id nullable + booking_simple_id + index + PG check
    if _table_exists(bind, "disputes"):
        with op.batch_alter_table("disputes") as batch_op:
            batch_op.alter_column(
                "booking_id",
                existing_type=sa.Integer(),
                nullable=True,
            )
            batch_op.add_column(
                sa.Column(
                    "booking_simple_id",
                    sa.Integer(),
                    sa.ForeignKey("bookings_simple.id", ondelete="SET NULL"),
                    nullable=True,
                )
            )
            batch_op.create_index(
                "ix_disputes_booking_simple_id",
                ["booking_simple_id"],
            )
        if _is_pg(bind):
            op.create_check_constraint(
                "ck_disputes_exactly_one_booking_ref",
                "disputes",
                "num_nonnulls(booking_id, booking_simple_id) = 1",
            )

    # 4) booking_requests.service_extras PV partial GIN index (Postgres only)
    if _is_pg(bind) and _table_exists(bind, "booking_requests") and _columns_exist(bind, "booking_requests", ["service_extras"]):
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_booking_requests_service_extras_pv
              ON public.booking_requests
              USING GIN ((service_extras::jsonb))
              WHERE (service_extras::jsonb ? 'pv');
            """
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _is_pg(bind):
        op.execute("DROP INDEX IF EXISTS ix_booking_requests_service_extras_pv")

    if _table_exists(bind, "disputes"):
        if _is_pg(bind):
            op.drop_constraint(
                "ck_disputes_exactly_one_booking_ref",
                "disputes",
                type_="check",
            )
        with op.batch_alter_table("disputes") as batch_op:
            batch_op.drop_index("ix_disputes_booking_simple_id")
            batch_op.drop_column("booking_simple_id")
            batch_op.alter_column(
                "booking_id",
                existing_type=sa.Integer(),
                nullable=False,
            )

    if _table_exists(bind, "quotes_v2"):
        op.drop_index("ix_quotes_v2_is_internal", table_name="quotes_v2")
        op.drop_column("quotes_v2", "is_internal")

    if _table_exists(bind, "bookings_simple"):
        op.drop_index(
            "ix_bookings_simple_booking_type", table_name="bookings_simple"
        )
        op.drop_index(
            "ix_bookings_simple_booking_request_id", table_name="bookings_simple"
        )
        op.drop_column("bookings_simple", "booking_type")
        op.drop_column("bookings_simple", "booking_request_id")
