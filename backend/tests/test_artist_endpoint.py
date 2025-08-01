from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import BaseModel
from app.models.user import User, UserType
from app.models.artist_profile_v2 import ArtistProfileV2
from app.api.dependencies import get_db
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


def test_artist_profiles_endpoint_returns_paginated(monkeypatch):
    Session = setup_app(monkeypatch)
    db = Session()
    user = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="B",
        user_type=UserType.ARTIST,
    )
    profile = ArtistProfileV2(user_id=1, business_name="Test Artist")
    db.add(user)
    db.add(profile)
    db.commit()
    client = TestClient(app)
    res = client.get("/api/v1/artist-profiles/")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert isinstance(body["data"], list)
    assert body["data"][0]["business_name"] == "Test Artist"
    assert isinstance(body["price_distribution"], list)
    app.dependency_overrides.pop(get_db, None)
