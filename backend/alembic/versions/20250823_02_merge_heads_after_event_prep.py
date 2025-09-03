"""
Merge heads after adding event_prep fields

Revision ID: 20250823_02_merge_heads
Revises: 20250823_01_add_event_type_guests, ab12cd34ef56
Create Date: 2025-08-23
"""

from alembic import op  # noqa: F401  (kept for consistency)
import sqlalchemy as sa  # noqa: F401

# revision identifiers, used by Alembic.
revision = '20250823_02_merge_heads'
down_revision = ('20250823_01_add_event_type_guests', 'ab12cd34ef56')
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is a merge migration; no schema changes required.
    pass


def downgrade() -> None:
    # Downgrade would split the heads again; leave as no-op.
    pass

