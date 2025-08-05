from decimal import Decimal
from fastapi.testclient import TestClient

from app.services import quote_ai
from app.main import app


def test_generate_quote_draft_without_key(monkeypatch):
    desc, adj = quote_ai.generate_quote_draft("test", Decimal("100"))
    assert desc == "test"
    assert adj == Decimal("0")


def test_calculate_quote_endpoint_includes_ai_fields():
    client = TestClient(app)
    res = client.post("/api/v1/quotes/calculate", json={"base_fee": 100, "distance_km": 0})
    assert res.status_code == 200
    data = res.json()
    assert "ai_description" in data
    assert "ai_price_adjustment" in data
