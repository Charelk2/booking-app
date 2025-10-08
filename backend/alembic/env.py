from logging.config import fileConfig
import os # Added to handle potential path issues
import sys # Added to handle potential path issues

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Ensure the app directory is in the Python path
# This assumes env.py is in alembic/ and app/ is one level up and then down into app/
# For a structure like backend/alembic/env.py and backend/app/
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.'))) 


# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
# target_metadata = None # Original placeholder

from app.database import Base  # Import Base from your app's database module
# Import all models to ensure they are registered with Base.metadata
from app.models import User, ServiceProviderProfile, Service, Booking, Review, BookingRequest, Quote

target_metadata = Base.metadata # Point Alembic to your app's metadata


# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def _apply_url_override_from_env() -> None:
    """Override sqlalchemy.url if DB_URL/SQLALCHEMY_DATABASE_URL is set in env.

    Precedence: DB_URL -> SQLALCHEMY_DATABASE_URL -> alembic.ini default.
    """
    try:
        env_url = os.getenv("DB_URL") or os.getenv("SQLALCHEMY_DATABASE_URL")
        if env_url:
            config.set_main_option("sqlalchemy.url", env_url)
    except Exception:
        # Never break migrations on env reading issues
        pass


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    _apply_url_override_from_env()
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    _apply_url_override_from_env()
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
