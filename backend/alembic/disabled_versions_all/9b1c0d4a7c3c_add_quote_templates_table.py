"""add_quote_templates_table

Revision ID: 9b1c0d4a7c3c
Revises: 4378675197d5
Create Date: 2025-06-17 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '9b1c0d4a7c3c'
down_revision: Union[str, None] = '4378675197d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'quote_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('artist_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('services', sa.JSON(), nullable=False),
        sa.Column('sound_fee', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('travel_fee', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('accommodation', sa.String(), nullable=True),
        sa.Column('discount', sa.Numeric(10, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['artist_id'], ['users.id'], ondelete='CASCADE'),
    )


def downgrade() -> None:
    op.drop_table('quote_templates')
