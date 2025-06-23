import logging
from fastapi.testclient import TestClient

from app.main import app, logger, settings


def test_warn_on_placeholder_gateway_url(monkeypatch, caplog):
    monkeypatch.setattr(settings, "PAYMENT_GATEWAY_URL", "https://example.com", raising=False)
    caplog.set_level("WARNING", logger=logger.name)
    with TestClient(app):
        pass
    assert any(
        "PAYMENT_GATEWAY_URL is set to the default placeholder" in r.getMessage()
        for r in caplog.records
    )
