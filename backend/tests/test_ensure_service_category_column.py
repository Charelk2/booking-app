from sqlalchemy import Column, Integer, MetaData, Table, inspect, create_engine
from sqlalchemy.pool import StaticPool

from app.db_utils import ensure_service_category_id_column


def test_ensure_service_category_columns():
    # Create tables without category columns to simulate a pre-migration database
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    metadata = MetaData()
    Table("artist_profiles", metadata, Column("user_id", Integer, primary_key=True))
    Table("services", metadata, Column("id", Integer, primary_key=True))
    metadata.create_all(engine)

    # Run the helper which should add the missing columns
    ensure_service_category_id_column(engine)
    inspector = inspect(engine)

    service_cols = {col["name"] for col in inspector.get_columns("services")}
    artist_cols = {col["name"] for col in inspector.get_columns("artist_profiles")}

    assert "service_category_id" not in artist_cols
    assert "service_category_id" in service_cols
    assert "details" in service_cols
