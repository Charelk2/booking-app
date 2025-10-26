"""Add attachment meta to messages (stub to repair chain)"""
from alembic import op
import sqlalchemy as sa
revision = '20250901_add_attachment_meta_to_messages'
down_revision = '20250823_02_merge_heads'  # this must exist in alembic/versions
branch_labels = None
depends_on = None
def upgrade():
    # NO-OP stub to repair the migration graph.
    pass

def downgrade():
    pass
