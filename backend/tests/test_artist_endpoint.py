from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import BaseModel
from app.models.user import User, UserType
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.service import Service, ServiceType
from app.models.service_category import ServiceCategory
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
        user_type=UserType.SERVICE_PROVIDER,
    )
    profile = ServiceProviderProfile(user_id=1, business_name="Test Artist")
    service = Service(
        artist_id=1,
        title="My Service",
        description="",
        media_url="http://example.com",
        price=100,
        currency="ZAR",
        duration_minutes=60,
        service_type=ServiceType.LIVE_PERFORMANCE,
    )
    profile.services.append(service)
    db.add(user)
    db.add(profile)
    db.commit()
    client = TestClient(app)
    res = client.get("/api/v1/service-provider-profiles/")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert isinstance(body["data"], list)
    assert body["data"][0]["business_name"] == "Test Artist"
    assert isinstance(body["price_distribution"], list)
    app.dependency_overrides.pop(get_db, None)


def test_artist_profiles_excludes_artists_without_services(monkeypatch):
    Session = setup_app(monkeypatch)
    db = Session()
    user = User(
        email="noservice@test.com",
        password="x",
        first_name="No",
        last_name="Service",
        user_type=UserType.SERVICE_PROVIDER,
    )
    profile = ServiceProviderProfile(user_id=1, business_name="Hidden Artist")
    db.add_all([user, profile])
    db.commit()
    client = TestClient(app)
    res = client.get("/api/v1/service-provider-profiles/")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    app.dependency_overrides.pop(get_db, None)


def test_artist_profiles_unknown_category_returns_empty(monkeypatch):
    """Unknown categories should yield an empty result set."""
    Session = setup_app(monkeypatch)
    db = Session()
    user = User(
        email="b@test.com",
        password="x",
        first_name="B",
        last_name="C",
        user_type=UserType.SERVICE_PROVIDER,
    )
    profile = ServiceProviderProfile(user_id=1, business_name="Another Artist")
    db.add(user)
    db.add(profile)
    db.commit()
    client = TestClient(app)
    res = client.get("/api/v1/service-provider-profiles/?category=Guitarist")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    app.dependency_overrides.pop(get_db, None)


def test_category_excludes_artists_without_services(monkeypatch):
    """Artists without services for the category should be excluded."""
    Session = setup_app(monkeypatch)
    db = Session()

    dj_cat = ServiceCategory(name="DJ")
    db.add(dj_cat)
    db.commit()

    user = User(
        email="dj@test.com",
        password="x",
        first_name="DJ",
        last_name="NoService",
        user_type=UserType.SERVICE_PROVIDER,
    )
    profile = ServiceProviderProfile(
        user_id=1,
        business_name="DJ Without Service",
    )
    db.add_all([user, profile])
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/service-provider-profiles/?category=DJ")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0

    service = Service(
        artist_id=1,
        title="DJ Set",
        description="",
        media_url="http://example.com",
        price=100,
        currency="ZAR",
        duration_minutes=60,
        service_type=ServiceType.LIVE_PERFORMANCE,
        service_category_id=dj_cat.id,
    )
    db.add(service)
    db.commit()

    res = client.get("/api/v1/service-provider-profiles/?category=DJ")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["data"][0]["service_categories"] == ["DJ"]
    app.dependency_overrides.pop(get_db, None)


def test_dj_category_filters_legacy_artists(monkeypatch):
    """Profiles with a business name matching the user's full name are excluded."""
    Session = setup_app(monkeypatch)
    db = Session()

    dj_cat = ServiceCategory(name="DJ")
    db.add(dj_cat)
    db.commit()

    legacy_user = User(
        email="legacy@test.com",
        password="x",
        first_name="Legacy",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    legacy_profile = ServiceProviderProfile(
        user_id=1,
        business_name="Legacy Artist",
    )
    legacy_service = Service(
        artist_id=1,
        title="Old Set",
        description="",
        media_url="http://example.com",
        price=100,
        currency="ZAR",
        duration_minutes=60,
        service_type=ServiceType.LIVE_PERFORMANCE,
        service_category_id=dj_cat.id,
    )

    dj_user = User(
        email="dj@test.com",
        password="x",
        first_name="Thabo",
        last_name="Mix",
        user_type=UserType.SERVICE_PROVIDER,
    )
    dj_profile = ServiceProviderProfile(
        user_id=2,
        business_name="Thabo Mix",
        profile_picture_url="http://example.com/pic.jpg",
    )
    dj_service = Service(
        artist_id=2,
        title="DJ Set",
        description="",
        media_url="http://example.com",
        price=200,
        currency="ZAR",
        duration_minutes=60,
        service_type=ServiceType.LIVE_PERFORMANCE,
        service_category_id=dj_cat.id,
    )

    db.add_all(
        [
            legacy_user,
            legacy_profile,
            legacy_service,
            dj_user,
            dj_profile,
            dj_service,
        ]
    )
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/service-provider-profiles/?category=DJ")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["data"][0]["business_name"] == "Thabo Mix"
    app.dependency_overrides.pop(get_db, None)
