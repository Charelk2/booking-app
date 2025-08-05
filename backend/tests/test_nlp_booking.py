from app.services import nlp_booking


def test_extract_booking_details_basic():
    text = "We need a band for 50 guests on 25 December 2025 in Cape Town"
    result = nlp_booking.extract_booking_details(text)
    assert result.date.isoformat() == "2025-12-25"
    assert result.location == "Cape Town"
    assert result.guests == 50
