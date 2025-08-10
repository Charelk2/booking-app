from fastapi.testclient import TestClient
import app.api.api_weather as api_weather
from app.main import app
from fastapi.testclient import TestClient


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
    assert res.status_code == 202
    task = res.json()["task_id"]
    res2 = client.get(f"/api/v1/travel-forecast/{task}")
    assert res2.status_code == 200
    assert res2.json() == {"location": "Paris", "forecast": [1, 2, 3]}


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
    task = res.json()["task_id"]
    res2 = client.get(f"/api/v1/travel-forecast/{task}")
    assert res2.status_code == 422
    data = res2.json()
    assert data["detail"]["field_errors"]["location"] == "Unknown location"


def test_travel_forecast_service_error(monkeypatch):
    def fake_get_3day_forecast(location: str):
        raise api_weather.weather_service.WeatherAPIError("boom")

    monkeypatch.setattr(
        api_weather.weather_service, "get_3day_forecast", fake_get_3day_forecast
    )
    client = TestClient(app)
    res = client.get("/api/v1/travel-forecast", params={"location": "Paris"})
    task = res.json()["task_id"]
    res2 = client.get(f"/api/v1/travel-forecast/{task}")
    assert res2.status_code == 502
    data = res2.json()
    assert data["detail"]["message"] == "Weather service error"
    assert data["detail"]["field_errors"] == {}
