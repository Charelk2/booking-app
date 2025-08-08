from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import BaseModel
from app.models.user import User, UserType
from app.models.artist_profile_v2 import ArtistProfileV2
from app.api.dependencies import get_db
from app.api.auth import get_current_user
from app.db_utils import ensure_service_category_id_column, seed_service_categories


def setup_db(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    ensure_service_category_id_column(engine)
    seed_service_categories(engine)
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
    return _override


def test_list_and_update_category(monkeypatch):
    Session = setup_db(monkeypatch)
    db = Session()
    user = User(
        email="sp@test.com",
        user_type=UserType.SERVICE_PROVIDER,
        first_name="A",
        last_name="B",
        phone_number="123",
        password="x",
    )
    db.add(user)
    db.commit()
    db.add(ArtistProfileV2(user_id=user.id))
    db.commit()

    prev_user = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = override_user(user)

    client = TestClient(app)

    res = client.get("/api/v1/service-categories/")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 10

    res = client.put("/api/v1/artist-profiles/me", json={"service_category_id": data[0]["id"]})
    assert res.status_code == 200
    assert res.json()["service_category_id"] == data[0]["id"]

    if prev_user is not None:
        app.dependency_overrides[get_current_user] = prev_user
    else:
        app.dependency_overrides.pop(get_current_user, None)
    db.close()
