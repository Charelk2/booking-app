from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import BaseModel
from app.models.user import User, UserType
from app.models.artist_profile_v2 import ArtistProfileV2
from app.api.dependencies import get_db, get_current_user


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

    app.dependency_overrides[get_db] = override_db
    return Session


def override_user(user):
    def _override():
        return user
    app.dependency_overrides[get_current_user] = _override


def test_recommendations_fallback(monkeypatch):
    Session = setup_app(monkeypatch)
    db = Session()

    artist = User(
        email="artist@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(artist)
    db.commit()
    db.refresh(artist)
    profile = ArtistProfileV2(user_id=artist.id, business_name="Test Artist")
    db.add(profile)
    db.commit()

    client_user = User(
        email="client@test.com",
        password="x",
        first_name="C",
        last_name="L",
        user_type=UserType.CLIENT,
    )
    db.add(client_user)
    db.commit()
    db.refresh(client_user)

    override_user(client_user)
    client = TestClient(app)
    res = client.get("/api/v1/artists/recommended")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    assert body[0]["business_name"] == "Test Artist"

    app.dependency_overrides.clear()
