import pytest
import fakeredis

from app.utils import redis_cache
from app.services import weather_service
from app.api.v1 import api_service_provider


def test_cache_artist_list(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)

    data = [{"id": 1, "business_name": "Test"}]
    redis_cache.cache_artist_list(data, page=1, category=None, location=None, sort=None, expire=10)
    assert redis_cache.get_cached_artist_list(page=1) == data


def test_cache_artist_list_page_specific(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)

    data = [{"id": 2, "business_name": "Another"}]
    redis_cache.cache_artist_list(
        data,
        page=2,
        limit=15,
        category="A",
        location="NY",
        sort="newest",
    )
    assert (
        redis_cache.get_cached_artist_list(
            page=2,
            limit=15,
            category="A",
            location="NY",
            sort="newest",
        )
        == data
    )
    assert (
        redis_cache.get_cached_artist_list(
            page=1,
            limit=15,
            category="A",
            location="NY",
            sort="newest",
        )
        is None
    )


def test_invalidate_artist_list_cache(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)

    data = [{"id": 3, "business_name": "X"}]
    redis_cache.cache_artist_list(data, page=1)
    assert redis_cache.get_cached_artist_list(page=1) == data
    redis_cache.invalidate_artist_list_cache()
    assert redis_cache.get_cached_artist_list(page=1) is None


from types import SimpleNamespace
from datetime import datetime
from app.models.service import Service, ServiceType

class DummyDB:
    def __init__(self, data):
        self.data = data
        self.called = 0

    def query(self, *models):
        self.called += 1

        class Q:
            def __init__(self, data):
                self._data = data
                self.rating = 0
                self.rating_count = 0
                self.book_count = 0

            def all(self):
                # Return tuples like the real query
                return [(item, None, 0, 0) for item in self._data]

            def outerjoin(self, *args, **kwargs):
                return self

            def join(self, *args, **kwargs):
                return self

            def filter(self, *args, **kwargs):
                return self

            def group_by(self, *args, **kwargs):
                return self

            def order_by(self, *args, **kwargs):
                return self

            @property
            def c(self):
                return self

            def subquery(self, *args, **kwargs):
                return self

        return Q(self.data)

class FailingDB(DummyDB):
    def query(self, *models):
        raise AssertionError("db should not be accessed")

def make_artist(id_: int):
    return SimpleNamespace(
        business_name="Test",
        description=None,
        location=None,
        hourly_rate=None,
        portfolio_urls=None,
        specialties=None,
        profile_picture_url=None,
        cover_photo_url=None,
        user_id=id_,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        user=None,
    )

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.base import BaseModel
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.user import User, UserType


def test_read_all_service_provider_profiles_uses_cache(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    user = User(email="a@test.com", password="x", first_name="A", last_name="B", user_type=UserType.SERVICE_PROVIDER)
    profile = ServiceProviderProfile(user_id=1, business_name="Test")
    service = Service(
        artist_id=1,
        title="Gig",
        description="",
        media_url="http://example.com",
        price=100,
        currency="ZAR",
        duration_minutes=60,
        service_type=ServiceType.LIVE_PERFORMANCE,
    )
    db.add_all([user, profile, service])
    db.commit()

    first = api_service_provider.read_all_service_provider_profiles(
        db=db,
        category=None,
        location=None,
        sort=None,
        page=1,
        limit=20,
        include_price_distribution=False,
    )
    assert len(first["data"]) == 1

    # Use failing DB to ensure cache is consulted on second call
    second = api_service_provider.read_all_service_provider_profiles(
        db=FailingDB([]),
        category=None,
        location=None,
        sort=None,
        page=1,
        limit=20,
        include_price_distribution=False,
    )
    assert second == first


def test_fallback_when_redis_unavailable(monkeypatch):
    class DummyRedis:
        def get(self, key):
            raise redis_cache.redis.exceptions.ConnectionError()
        def setex(self, *args, **kwargs):
            raise redis_cache.redis.exceptions.ConnectionError()

    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: DummyRedis())

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    user = User(email="b@test.com", password="x", first_name="B", last_name="C", user_type=UserType.SERVICE_PROVIDER)
    profile = ServiceProviderProfile(user_id=1, business_name="Test2")
    service = Service(
        artist_id=1,
        title="Set",
        description="",
        media_url="http://example.com",
        price=200,
        currency="ZAR",
        duration_minutes=45,
        service_type=ServiceType.LIVE_PERFORMANCE,
    )
    db.add_all([user, profile, service])
    db.commit()

    result = api_service_provider.read_all_service_provider_profiles(
        db=db,
        category=None,
        location=None,
        sort=None,
        page=1,
        limit=20,
        include_price_distribution=False,
    )
    assert len(result["data"]) == 1


def test_cache_weather_forecast(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)

    calls = {"count": 0}

    class DummyResp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"weather": [{"day": 1}, {"day": 2}, {"day": 3}]}

    def fake_get(url, params, timeout):
        calls["count"] += 1
        return DummyResp()

    monkeypatch.setattr(weather_service.httpx, "get", fake_get)

    first = weather_service.get_3day_forecast("Paris")
    second = weather_service.get_3day_forecast("Paris")
    assert calls["count"] == 1
    assert first == second


def test_cache_artist_availability(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)
    monkeypatch.setattr(api_service_provider.calendar_service, "fetch_events", lambda *a, **k: [])

    class DummyQuery:
        def filter(self, *args, **kwargs):
            return self

        def all(self):
            return []

    class DummyDB:
        def __init__(self):
            self.called = 0

        def query(self, *args, **kwargs):
            self.called += 1
            return DummyQuery()

    db = DummyDB()
    first = api_service_provider.read_artist_availability(1, db=db)
    assert db.called >= 2

    def fail_query(*args, **kwargs):
        raise AssertionError("db should not be accessed")

    db_fail = DummyDB()
    db_fail.query = fail_query
    second = api_service_provider.read_artist_availability(1, db=db_fail)
    assert first == second


