"""add composite index for messages after_id lookups

Revision ID: 20250920_add_messages_request_id_id_index
Revises: a1f3e2d4c6b7
Create Date: 2025-09-20 10:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20250920_add_messages_request_id_id_index'
down_revision: Union[str, None] = '20250901_add_attachment_meta_to_messages'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = 'ix_messages_request_id_id'
TABLE_NAME = 'messages'


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if TABLE_NAME not in insp.get_table_names():
        return
    existing = {idx['name'] for idx in insp.get_indexes(TABLE_NAME)}
    if INDEX_NAME in existing:
        return
    try:
        op.create_index(INDEX_NAME, TABLE_NAME, ['booking_request_id', 'id'])
    except Exception:
        # best-effort — continue even if the index already exists or creation is unsupported
        pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if TABLE_NAME not in insp.get_table_names():
        return
    existing = {idx['name'] for idx in insp.get_indexes(TABLE_NAME)}
    if INDEX_NAME not in existing:
        return
    try:
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)
    except Exception:
        pass
