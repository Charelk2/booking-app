"""
Add attachment_meta column to messages

Revision ID: 20250901_add_attachment_meta_to_messages
Revises: 20250823_02_merge_heads
Create Date: 2025-09-01
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250901_add_attachment_meta_to_messages'
down_revision = '20250823_02_merge_heads'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('attachment_meta', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'attachment_meta')
