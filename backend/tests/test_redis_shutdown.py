from fastapi.testclient import TestClient

from app.main import app
from app.utils import redis_cache


class DummyRedis:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


def test_close_redis_client(monkeypatch):
    dummy = DummyRedis()
    monkeypatch.setattr(redis_cache, "_redis_client", dummy)
    redis_cache.close_redis_client()
    assert dummy.closed
    assert redis_cache._redis_client is None


def test_shutdown_event_closes_client(monkeypatch):
    dummy = DummyRedis()
    monkeypatch.setattr(redis_cache, "_redis_client", dummy)
    monkeypatch.setattr(redis_cache, "get_redis_client", lambda: dummy)

    with TestClient(app):
        pass

    assert dummy.closed
    assert redis_cache._redis_client is None
