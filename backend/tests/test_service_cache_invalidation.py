from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.api.dependencies import get_db, get_current_service_provider
from app.models import User, UserType
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.service_category import ServiceCategory
from app.db_utils import seed_service_categories


def setup_app():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from app.models.base import BaseModel

    BaseModel.metadata.create_all(engine)
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


def test_create_service_invalidates_cache(monkeypatch):
    Session = setup_app()
    db = Session()
    user = User(
        email="sp@example.com",
        user_type=UserType.SERVICE_PROVIDER,
        first_name="A",
        last_name="B",
        password="x",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(ServiceProviderProfile(user_id=user.id))
    db.commit()

    def override_artist():
        return user
    called = {"flag": False}

    def fake_invalidate():
        called["flag"] = True

    monkeypatch.setattr(
        __import__("app.api.api_service", fromlist=["invalidate_artist_list_cache"]),
        "invalidate_artist_list_cache",
        fake_invalidate,
    )

    app.dependency_overrides[get_current_service_provider] = override_artist
    client = TestClient(app)
    category = db.query(ServiceCategory).first()
    payload = {
        "title": "Gig",
        "duration_minutes": 60,
        "price": "100.00",
        "service_type": "Other",
        "media_url": "x",
        "service_category_id": category.id,
    }
    res = client.post("/api/v1/services/", json=payload)
    assert res.status_code == 201
    assert called["flag"]

    app.dependency_overrides.pop(get_current_service_provider, None)
    db.close()
