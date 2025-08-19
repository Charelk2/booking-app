"""add visible_to and update message_type values

Revision ID: f23ad0e57c1d
Revises: e03ae2c1f3b6
Create Date: 2025-09-30 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f23ad0e57c1d"
down_revision: Union[str, None] = "e03ae2c1f3b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect = bind.dialect.name

    # Ensure messages table exists on fresh DBs
    if 'messages' not in insp.get_table_names():
        op.create_table(
            'messages',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('message_type', sa.String(), nullable=False, server_default='USER'),
        )

    if dialect == 'sqlite':
        # SQLite path: keep columns as TEXT and normalize values
        cols = {c['name'] for c in insp.get_columns('messages')}
        if 'visible_to' not in cols:
            op.add_column('messages', sa.Column('visible_to', sa.String(), nullable=False, server_default='both'))
        try:
            op.execute("UPDATE messages SET message_type='USER' WHERE message_type='text'")
            op.execute("UPDATE messages SET message_type=upper(message_type)")
        except Exception:
            pass
        # Drop server defaults via ALTER are not supported on SQLite; leave as-is
        return

    # Postgres/others: use proper ENUMs and ALTERs
    visible_enum = sa.Enum("artist", "client", "both", name="visibleto")
    message_enum = sa.Enum("USER", "QUOTE", "SYSTEM", name="messagetype")
    visible_enum.create(bind, checkfirst=True)
    message_enum.create(bind, checkfirst=True)
    op.add_column(
        "messages",
        sa.Column("visible_to", visible_enum, nullable=False, server_default="both"),
    )
    op.execute("UPDATE messages SET message_type='USER' WHERE message_type='text'")
    op.execute("UPDATE messages SET message_type=upper(message_type)")
    op.alter_column(
        "messages",
        "message_type",
        existing_type=sa.String(),
        type_=message_enum,
        existing_nullable=False,
        server_default="USER",
    )
    op.alter_column("messages", "message_type", server_default=None)
    op.alter_column("messages", "visible_to", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect = bind.dialect.name
    if 'messages' in insp.get_table_names():
        try:
            op.drop_column('messages', 'visible_to')
        except Exception:
            pass
        try:
            op.execute("UPDATE messages SET message_type=lower(message_type)")
        except Exception:
            pass
    if dialect != 'sqlite':
        try:
            op.execute("DROP TYPE IF EXISTS visibleto")
        except Exception:
            pass
        try:
            op.execute("DROP TYPE IF EXISTS messagetype")
        except Exception:
            pass
