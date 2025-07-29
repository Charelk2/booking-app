from datetime import date
from decimal import Decimal
import app.services.flight_service as flight_service


def test_get_cheapest_morning_success(monkeypatch):
    def fake_get(url, params=None, timeout=10):
        class Resp:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "data": [
                        {"departure_at": "2025-07-01T08:00:00Z", "price": 1000},
                        {"departure_at": "2025-07-01T14:00:00Z", "price": 800},
                    ]
                }

        return Resp()

    monkeypatch.setenv("FLIGHT_API_KEY", "x")
    monkeypatch.setattr(flight_service.httpx, "get", fake_get)
    price = flight_service.get_cheapest_morning_flight("CPT", "JNB", date(2025, 7, 1))
    assert price == Decimal("1000")


def test_get_cheapest_morning_failure(monkeypatch):
    def fake_get(*a, **k):
        raise Exception("boom")

    monkeypatch.setenv("FLIGHT_API_KEY", "x")
    monkeypatch.setattr(flight_service.httpx, "get", fake_get)
    try:
        flight_service.get_cheapest_morning_flight("CPT", "JNB", date(2025, 7, 1))
        assert False, "expected error"
    except flight_service.FlightAPIError:
        pass
