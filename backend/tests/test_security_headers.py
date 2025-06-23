from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_security_headers():
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers.get("Content-Security-Policy") == "default-src 'self'"
    assert (
        response.headers.get("Strict-Transport-Security")
        == "max-age=63072000; includeSubDomains"
    )
    assert response.headers.get("X-Frame-Options") == "DENY"
