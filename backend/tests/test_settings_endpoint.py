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
    import app.core.config as config, importlib
    importlib.reload(config)
    config.settings = config.load_settings()
    import app.api.api_settings as api_settings; importlib.reload(api_settings)
    import app.main as main_module; importlib.reload(main_module)
    override_client = TestClient(main_module.app)
    resp = override_client.get('/api/v1/settings')
    assert resp.status_code == 200
    assert resp.json() == {'default_currency': 'CHF'}


def test_smtp_settings_from_env_file(tmp_path, monkeypatch):
    env_file = tmp_path / 'smtp.env'
    env_file.write_text(
        'SMTP_HOST=mail.test\nSMTP_PORT=1025\nSMTP_USERNAME=user\nSMTP_PASSWORD=pass\nSMTP_FROM=from@test\n'
    )
    monkeypatch.setenv('ENV_FILE', str(env_file))
    import app.core.config as config
    import importlib
    importlib.reload(config)
    assert config.settings.SMTP_HOST == 'mail.test'
    assert config.settings.SMTP_PORT == 1025
    assert config.settings.SMTP_USERNAME == 'user'
    assert config.settings.SMTP_PASSWORD == 'pass'
    assert config.settings.SMTP_FROM == 'from@test'
