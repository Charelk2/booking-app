from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.api.dependencies import get_db
from app.models.base import BaseModel
from app.models.service_provider_profile import ServiceProviderProfile
from app.utils import redis_cache


def setup_app(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    monkeypatch.setattr(redis_cache, "get_cached_artist_list", lambda *a, **k: None)
    monkeypatch.setattr(redis_cache, "cache_artist_list", lambda *a, **k: None)
    app.dependency_overrides[get_db] = override_db
    return Session


def test_service_provider_has_no_default_category(monkeypatch):
    Session = setup_app(monkeypatch)
    client = TestClient(app)
    payload = {
        "email": "sp@example.com",
        "password": "secret123",
        "first_name": "Service",
        "last_name": "Provider",
        "phone_number": "+1234567890",
        "user_type": "service_provider",
    }
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 200

    db = Session()
    profile = db.query(ServiceProviderProfile).first()
    assert profile is not None
    # Newly registered providers should not have any services yet,
    # so they are not categorized until they add one.
    assert profile.services == []
    db.close()
    app.dependency_overrides.pop(get_db, None)
