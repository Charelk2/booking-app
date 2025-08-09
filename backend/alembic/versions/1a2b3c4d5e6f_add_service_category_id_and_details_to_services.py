"""add_service_category_id_and_details_to_services

Revision ID: 1a2b3c4d5e6f
Revises: 80a1b6c7d8a9
Create Date: 2025-07-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '1a2b3c4d5e6f'
down_revision: Union[str, None] = '80a1b6c7d8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('services', sa.Column('service_category_id', sa.Integer(), nullable=True))
    op.add_column('services', sa.Column('details', sa.JSON(), nullable=True))
    op.create_foreign_key(
        'fk_services_service_category_id',
        'services',
        'service_categories',
        ['service_category_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_services_service_category_id', 'services', type_='foreignkey')
    op.drop_column('services', 'details')
    op.drop_column('services', 'service_category_id')
