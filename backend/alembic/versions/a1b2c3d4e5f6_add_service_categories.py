"""add service_categories table and service_category_id"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'f23ad0e57c1d'
branch_labels = None
depends_on = None


CATEGORIES = [
    {"name": "Photography"},
    {"name": "Catering"},
    {"name": "Music"},
    {"name": "Lighting"},
    {"name": "Sound"},
    {"name": "Decor"},
    {"name": "Venue"},
    {"name": "Transport"},
    {"name": "Security"},
    {"name": "Entertainment"},
]


def upgrade() -> None:
    op.create_table(
        'service_categories',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, unique=True),
    )
    op.add_column(
        'artist_profiles',
        sa.Column('service_category_id', sa.Integer(), nullable=True)
    )
    op.create_index(
        op.f('ix_artist_profiles_service_category_id'),
        'artist_profiles',
        ['service_category_id'],
        unique=False,
    )
    op.create_foreign_key(
        'fk_artist_profiles_service_category',
        'artist_profiles',
        'service_categories',
        ['service_category_id'],
        ['id'],
        ondelete='SET NULL',
    )

    service_categories_table = sa.table(
        'service_categories', sa.column('name', sa.String())
    )
    op.bulk_insert(service_categories_table, CATEGORIES)


def downgrade() -> None:
    op.drop_constraint(
        'fk_artist_profiles_service_category',
        'artist_profiles',
        type_='foreignkey',
    )
    op.drop_index(
        op.f('ix_artist_profiles_service_category_id'),
        table_name='artist_profiles'
    )
    op.drop_column('artist_profiles', 'service_category_id')
    op.drop_table('service_categories')
