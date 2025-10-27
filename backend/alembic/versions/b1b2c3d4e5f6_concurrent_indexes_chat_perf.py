"""concurrent indexes for chat performance (messages, reactions, spp)

Revision ID: b1b2c3d4e5f6
Revises: f2d738878622
Create Date: 2025-10-27
"""

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "b1b2c3d4e5f6"
down_revision = "f2d738878622"
branch_labels = None
depends_on = None


def _is_pg(bind) -> bool:
    try:
        return (getattr(bind.dialect, "name", "").lower() == "postgresql")
    except Exception:
        return False


def _table_exists(bind, table_name: str) -> bool:
    try:
        row = bind.execute(
            text(
                "SELECT to_regclass(current_schema() || '." + table_name + "') IS NOT NULL"
            )
        ).scalar()
        return bool(row)
    except Exception:
        return False


def _columns_exist(bind, table: str, cols: list[str]) -> bool:
    try:
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


def _has_index_on(bind, table: str, col_list: list[str]) -> bool:
    """Best-effort: detect any index on table whose indexed columns match col_list in order."""
    try:
        rows = bind.execute(
            text(
                """
                SELECT indexname, indexdef
                  FROM pg_indexes
                 WHERE schemaname = current_schema()
                   AND tablename = :t
                """
            ),
            {"t": table},
        ).fetchall()
        target = ", ".join(col_list)
        needle1 = f"({target})"
        needle2 = f"({target} DESC)"  # tolerate DESC in defs
        for _, idxdef in rows:
            s = str(idxdef)
            if needle1 in s or needle2 in s:
                return True
        return False
    except Exception:
        return False


def upgrade() -> None:
    """Create missing indexes concurrently without blocking writes.

    We cannot run CREATE INDEX CONCURRENTLY inside a transaction; instead, we
    temporarily COMMIT the migration transaction, run all concurrent index
    statements, then BEGIN a new transaction for Alembic to finish cleanly.
    """
    bind = op.get_bind()
    if not _is_pg(bind):
        # Skip on non-Postgres (e.g., local SQLite dev)
        return

    stmts: list[str] = []

    # messages(booking_request_id, timestamp)
    if _table_exists(bind, "messages") and _columns_exist(bind, "messages", ["booking_request_id", "timestamp"]) and not _has_index_on(bind, "messages", ["booking_request_id", "timestamp"]):
        stmts.append(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_messages_request_time ON public.messages (booking_request_id, timestamp)"
        )

    # messages(booking_request_id, id)
    if _table_exists(bind, "messages") and _columns_exist(bind, "messages", ["booking_request_id", "id"]) and not _has_index_on(bind, "messages", ["booking_request_id", "id"]):
        stmts.append(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_messages_request_id_id ON public.messages (booking_request_id, id)"
        )

    # message_reactions(message_id)
    if _table_exists(bind, "message_reactions") and _columns_exist(bind, "message_reactions", ["message_id"]) and not _has_index_on(bind, "message_reactions", ["message_id"]):
        stmts.append(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions (message_id)"
        )

    # service_provider_profiles(user_id) — PK on user_id usually covers this, but add if truly missing
    has_spp = _table_exists(bind, "service_provider_profiles") and _columns_exist(bind, "service_provider_profiles", ["user_id"])
    if has_spp and not _has_index_on(bind, "service_provider_profiles", ["user_id"]):
        stmts.append(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spp_user_id ON public.service_provider_profiles (user_id)"
        )

    if not stmts:
        return

    # Exit the current transaction, run concurrent DDL, then start a new txn
    op.execute("COMMIT")
    for s in stmts:
        bind.execute(text(s))
    op.execute("BEGIN")


def downgrade() -> None:
    bind = op.get_bind()
    if not _is_pg(bind):
        return
    # Drop in autocommit; IF EXISTS so repeated runs are safe.
    with op.get_context().autocommit_block():
        bind.execute(text("DROP INDEX IF EXISTS idx_spp_user_id"))
    with op.get_context().autocommit_block():
        bind.execute(text("DROP INDEX IF EXISTS idx_message_reactions_message_id"))
    with op.get_context().autocommit_block():
        bind.execute(text("DROP INDEX IF EXISTS ix_messages_request_id_id"))
    with op.get_context().autocommit_block():
        bind.execute(text("DROP INDEX IF EXISTS ix_messages_request_time"))
