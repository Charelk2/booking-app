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
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if 'services' not in tables:
        # Create minimal table so follow-up column adds succeed on fresh DBs
        op.create_table(
            'services',
            sa.Column('id', sa.Integer(), primary_key=True),
        )
    cols = {c['name'] for c in insp.get_columns('services')}
    if 'service_category_id' not in cols:
        op.add_column('services', sa.Column('service_category_id', sa.Integer(), nullable=True))
    if 'details' not in cols:
        op.add_column('services', sa.Column('details', sa.JSON(), nullable=True))
    # Add FK only if target table exists and not already present
    if 'service_categories' in tables:
        try:
            op.create_foreign_key(
                'fk_services_service_category_id',
                'services',
                'service_categories',
                ['service_category_id'],
                ['id'],
                ondelete='SET NULL',
            )
        except Exception:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'services' in insp.get_table_names():
        try:
            op.drop_constraint('fk_services_service_category_id', 'services', type_='foreignkey')
        except Exception:
            pass
        cols = {c['name'] for c in insp.get_columns('services')}
        if 'details' in cols:
            op.drop_column('services', 'details')
        if 'service_category_id' in cols:
            op.drop_column('services', 'service_category_id')
