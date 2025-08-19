"""Rename artist_profiles to service_provider_profiles and update FKs

SQLite-safe migration that:
- Renames the table if present
- Rebuilds any tables whose CREATE SQL references artist_profiles
- Leaves a compatibility view optional (disabled by default)

Revision ID: ee99a1b2c3d4
Revises: def456abc123
Create Date: 2025-08-18 15:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'ee99a1b2c3d4'
down_revision: Union[str, None] = 'def456abc123'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _sqlite_rebuild_referencing_tables(conn) -> None:
    # Find all tables whose CREATE SQL references artist_profiles
    rows = conn.execute(sa.text("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL")).fetchall()
    for name, sql in rows:
        if 'artist_profiles' in (sql or ''):
            # Build a new CREATE TABLE statement replacing the reference
            new_sql = sql.replace('artist_profiles', 'service_provider_profiles')
            temp = f"{name}_new"
            # Create new table
            conn.execute(sa.text(new_sql.replace(f"CREATE TABLE {name}", f"CREATE TABLE {temp}")
                                   .replace(f'CREATE TABLE "{name}"', f'CREATE TABLE "{temp}"')))
            # Copy data
            cols = [r[1] for r in conn.execute(sa.text(f"PRAGMA table_info({name})")).fetchall()]
            col_list = ",".join([f'"{c}"' for c in cols]) if cols else "*"
            conn.execute(sa.text(f"INSERT INTO {temp} ({col_list}) SELECT {col_list} FROM {name}"))
            # Drop old and rename
            conn.execute(sa.text(f"DROP TABLE {name}"))
            conn.execute(sa.text(f"ALTER TABLE {temp} RENAME TO {name}"))


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'sqlite':
        # If legacy table exists, rename it; else, nothing to do.
        tables = {r[0] for r in bind.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if 'artist_profiles' in tables and 'service_provider_profiles' not in tables:
            bind.execute(sa.text("PRAGMA foreign_keys=OFF"))
            bind.execute(sa.text("ALTER TABLE artist_profiles RENAME TO service_provider_profiles"))
            _sqlite_rebuild_referencing_tables(bind)
            bind.execute(sa.text("PRAGMA foreign_keys=ON"))
        else:
            # Fresh DBs may never have had artist_profiles; ensure target exists
            if 'service_provider_profiles' not in tables:
                bind.execute(sa.text(
                    """
                    CREATE TABLE service_provider_profiles (
                        user_id INTEGER PRIMARY KEY,
                        business_name VARCHAR,
                        custom_subtitle VARCHAR,
                        description TEXT,
                        location VARCHAR,
                        hourly_rate NUMERIC(10,2),
                        portfolio_urls JSON,
                        portfolio_image_urls JSON,
                        specialties JSON,
                        profile_picture_url VARCHAR,
                        cover_photo_url VARCHAR,
                        price_visible BOOLEAN NOT NULL DEFAULT TRUE,
                        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                    """
                ))
    else:
        # Postgres/MySQL: simple rename; FKs update automatically on Postgres
        op.rename_table('artist_profiles', 'service_provider_profiles')


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == 'sqlite':
        tables = {r[0] for r in bind.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if 'service_provider_profiles' in tables and 'artist_profiles' not in tables:
            bind.execute(sa.text("PRAGMA foreign_keys=OFF"))
            bind.execute(sa.text("ALTER TABLE service_provider_profiles RENAME TO artist_profiles"))
            _sqlite_rebuild_referencing_tables(bind)
            bind.execute(sa.text("PRAGMA foreign_keys=ON"))
    else:
        op.rename_table('service_provider_profiles', 'artist_profiles')

