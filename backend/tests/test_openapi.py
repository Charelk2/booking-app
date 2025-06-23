from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_openapi_contains_routes():
    spec = client.get("/openapi.json")
    assert spec.status_code == 200
    paths = spec.json().get("paths", {})
    assert any("/api/v1/bookings" in p for p in paths)
    assert "/auth/login" in paths

