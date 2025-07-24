import pytest
import fakeredis

from app.utils import redis_cache


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


from types import SimpleNamespace
from datetime import datetime
from app.api.v1 import api_artist

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
from app.models.artist_profile_v2 import ArtistProfileV2
from app.models.user import User, UserType


def test_read_all_artist_profiles_uses_cache(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    user = User(email="a@test.com", password="x", first_name="A", last_name="B", user_type=UserType.ARTIST)
    profile = ArtistProfileV2(user_id=1, business_name="Test")
    db.add(user)
    db.add(profile)
    db.commit()

    first = api_artist.read_all_artist_profiles(
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
    second = api_artist.read_all_artist_profiles(
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

    user = User(email="b@test.com", password="x", first_name="B", last_name="C", user_type=UserType.ARTIST)
    profile = ArtistProfileV2(user_id=1, business_name="Test2")
    db.add(user)
    db.add(profile)
    db.commit()

    result = api_artist.read_all_artist_profiles(
        db=db,
        category=None,
        location=None,
        sort=None,
        page=1,
        limit=20,
        include_price_distribution=False,
    )
    assert len(result["data"]) == 1
