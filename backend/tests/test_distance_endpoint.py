from fastapi.testclient import TestClient
from app.main import app
import routes.distance as distance_route


def test_get_distance_success(monkeypatch):
    def fake_get(url, params=None, timeout=10):
        class Resp:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"rows": []}

        return Resp()

    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "test-key")
    monkeypatch.setattr(distance_route.httpx, "get", fake_get)
    client = TestClient(app)
    res = client.get(
        "/api/v1/distance",
        params={"from_location": "Cape Town", "to_location": "Durban"},
    )
    assert res.status_code == 200
    assert res.json() == {"rows": []}


def test_get_distance_missing_key(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    client = TestClient(app)
    res = client.get(
        "/api/v1/distance",
        params={"from_location": "A", "to_location": "B"},
    )
    assert res.status_code == 500
    assert res.json()["error"] == "GOOGLE_MAPS_API_KEY not set"


def test_get_distance_service_error(monkeypatch):
    def fake_get(*a, **k):
        raise Exception("boom")

    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "test")
    monkeypatch.setattr(distance_route.httpx, "get", fake_get)
    client = TestClient(app)
    res = client.get(
        "/api/v1/distance",
        params={"from_location": "A", "to_location": "B"},
    )
    assert res.status_code == 502
    assert res.json()["error"] == "Failed to fetch distance"
