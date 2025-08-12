from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import BaseModel
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


def test_create_and_retrieve_service_with_category():
    Session = setup_app()
    db = Session()
    user = User(
        email="sp@test.com",
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

    prev_artist = app.dependency_overrides.get(get_current_service_provider)
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
        "details": {"genre": "rock"},
    }
    res = client.post("/api/v1/services/", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["service_category_id"] == category.id
    assert data["service_category_slug"] == category.name.lower().replace(" ", "_")
    assert data["details"] == {"genre": "rock"}

    res_get = client.get(f"/api/v1/services/{data['id']}")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert data_get["details"] == {"genre": "rock"}
    assert data_get["service_category_slug"] == category.name.lower().replace(" ", "_")

    bad_payload = payload.copy()
    bad_payload["service_category_id"] = 9999
    res_bad = client.post("/api/v1/services/", json=bad_payload)
    assert res_bad.status_code == 422
    assert (
        res_bad.json()["detail"]["field_errors"]["service_category_id"] == "invalid"
    )

    if prev_artist is not None:
        app.dependency_overrides[get_current_service_provider] = prev_artist
    else:
        app.dependency_overrides.pop(get_current_service_provider, None)
    db.close()
