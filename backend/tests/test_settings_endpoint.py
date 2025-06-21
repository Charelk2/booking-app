from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
import importlib

client = TestClient(app)

def test_settings_endpoint_returns_default_currency():
    resp = client.get('/api/v1/settings')
    assert resp.status_code == 200
    assert resp.json() == {'default_currency': settings.DEFAULT_CURRENCY}


def test_env_file_override(tmp_path, monkeypatch):
    custom_env = tmp_path / 'override.env'
    custom_env.write_text('DEFAULT_CURRENCY=CHF\n')
    monkeypatch.setenv('ENV_FILE', str(custom_env))
    import app.core.config as config
    importlib.reload(config)
    import app.api.api_settings as api_settings
    importlib.reload(api_settings)
    import app.main as main_module
    importlib.reload(main_module)
    override_client = TestClient(main_module.app)
    resp = override_client.get('/api/v1/settings')
    assert resp.status_code == 200
    assert resp.json() == {'default_currency': 'CHF'}
