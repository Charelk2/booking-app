from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

def test_settings_endpoint_returns_default_currency():
    resp = client.get('/api/v1/settings')
    assert resp.status_code == 200
    assert resp.json() == {'default_currency': settings.DEFAULT_CURRENCY}
