"""create reviews table

Revision ID: 01dc14acc6a1
Revises: c8f4f76b2a6b
Create Date: 2025-06-19 08:27:33.012302

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01dc14acc6a1'
down_revision: Union[str, None] = 'c8f4f76b2a6b'
branch_labels: Union[str, Sequence[str], None] = None
# Ensure prerequisites exist before creating reviews
# - services table: 60101124c3b1_add_media_url_to_services
# - bookings table: b7c1d2e3f4a5_create_bookings_table_if_missing
depends_on: Union[str, Sequence[str], None] = ('60101124c3b1', 'b7c1d2e3f4a5')


def upgrade() -> None:
    op.create_table(
        'reviews',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('booking_id', sa.Integer(), nullable=False),
        sa.Column('service_id', sa.Integer(), nullable=False),
        sa.Column('artist_id', sa.Integer(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], ondelete='CASCADE'),
        # Keep DB-level FK minimal and compatible across rename; app enforces SPP presence
        sa.ForeignKeyConstraint(['artist_id'], ['users.id'], ondelete='CASCADE'),
    )


def downgrade() -> None:
    op.drop_table('reviews')
