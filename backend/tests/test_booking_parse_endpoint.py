from fastapi.testclient import TestClient

from app.main import app


def test_parse_booking_text_endpoint():
    client = TestClient(app)
    res = client.post(
        "/api/v1/booking-requests/parse",

        json={"text": "corporate party for 30 guests on 5 May 2026 in Johannesburg"},

    )
    assert res.status_code == 200
    data = res.json()
    assert data["guests"] == 30
    assert data["location"] == "Johannesburg"
    assert data["date"].startswith("2026-05-05")

    assert data["event_type"] == "Corporate"

