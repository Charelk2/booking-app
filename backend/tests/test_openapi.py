from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_openapi_contains_routes():
    spec = client.get("/openapi.json")
    assert spec.status_code == 200
    paths = spec.json().get("paths", {})
    assert any("/api/v1/bookings" in p for p in paths)
    assert "/auth/login" in paths


def test_notifications_schema_includes_sender_fields():
    spec = client.get("/openapi.json")
    assert spec.status_code == 200
    schema = spec.json()["components"]["schemas"]["NotificationResponse"]
    props = schema.get("properties", {})
    assert "sender_name" in props
    assert "booking_type" in props

