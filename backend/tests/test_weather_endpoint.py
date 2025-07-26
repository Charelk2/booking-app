from fastapi.testclient import TestClient
import app.api.api_weather as api_weather
from app.main import app


def test_travel_forecast_success(monkeypatch):
    def fake_get(url, params=None, timeout=10):
        class Resp:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"weather": [1, 2, 3, 4]}

        return Resp()

    monkeypatch.setattr(api_weather.weather_service.httpx, "get", fake_get)
    client = TestClient(app)
    res = client.get("/api/v1/travel-forecast", params={"location": "Paris"})
    assert res.status_code == 200
    assert res.json() == {"location": "Paris", "forecast": [1, 2, 3]}


def test_travel_forecast_invalid_location(monkeypatch):
    def fake_get(url, params=None, timeout=10):
        class Resp:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {}

        return Resp()

    monkeypatch.setattr(api_weather.weather_service.httpx, "get", fake_get)
    client = TestClient(app)
    res = client.get("/api/v1/travel-forecast", params={"location": "Nowhere"})
    assert res.status_code == 422
    data = res.json()
    assert data["detail"]["field_errors"]["location"] == "Unknown location"
