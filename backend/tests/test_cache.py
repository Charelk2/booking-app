import pytest
import fakeredis

from app.utils import redis_cache


def test_cache_artist_list(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)

    data = [{"id": 1, "business_name": "Test"}]
    redis_cache.cache_artist_list(data, expire=10)
    assert redis_cache.get_cached_artist_list() == data


from types import SimpleNamespace
from datetime import datetime
from app.api.v1 import api_artist

class DummyDB:
    def __init__(self, data):
        self.data = data
        self.called = 0
    def query(self, model):
        self.called += 1
        class Q:
            def __init__(self, data):
                self._data = data
            def all(self):
                return self._data
        return Q(self.data)

class FailingDB(DummyDB):
    def query(self, model):
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

def test_read_all_artist_profiles_uses_cache(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: fake)

    first_db = DummyDB([make_artist(1)])
    first = api_artist.read_all_artist_profiles(first_db)
    assert first_db.called == 1

    second_db = FailingDB([])
    second = api_artist.read_all_artist_profiles(second_db)
    assert second == first


def test_fallback_when_redis_unavailable(monkeypatch):
    class DummyRedis:
        def get(self, key):
            raise redis_cache.redis.exceptions.ConnectionError()
        def setex(self, *args, **kwargs):
            raise redis_cache.redis.exceptions.ConnectionError()

    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: DummyRedis())

    db = DummyDB([make_artist(2)])
    result = api_artist.read_all_artist_profiles(db)
    # when redis fails, it should query the db once
    assert db.called == 1
    assert result[0].user_id == 2
