from decimal import Decimal

import app.services.booking_quote as booking_quote
import app.services.travel_estimator as travel_estimator


def test_estimate_travel_returns_modes():
    estimates = travel_estimator.estimate_travel(100)
    modes = {e["mode"] for e in estimates}
    assert {"driving", "flight"}.issubset(modes)


def test_quote_breakdown_uses_estimator(monkeypatch):
    def fake_estimate(_distance):
        return [{"mode": "teleport", "cost": Decimal("42")}] 

    monkeypatch.setattr(booking_quote, "estimate_travel", fake_estimate)
    breakdown = booking_quote.calculate_quote_breakdown(Decimal("100"), 1)
    assert breakdown["travel_mode"] == "teleport"
    assert breakdown["travel_cost"] == Decimal("42.00")
    assert breakdown["travel_estimates"][0]["mode"] == "teleport"
