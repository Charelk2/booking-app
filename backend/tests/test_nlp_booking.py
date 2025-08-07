from datetime import date

from app.services import nlp_booking


def test_extract_booking_details_basic():
    text = "We need a band for 50 guests on 25 December 2025 in Cape Town"
    result = nlp_booking.extract_booking_details(text)
    assert result.date.isoformat() == "2025-12-25"
    assert result.location == "Cape Town"
    assert result.guests == 50

    assert result.event_type is None


def test_extract_handles_lowercase_location_and_no_year():
    text = "birthday celebration in pretoria 6 august"
    result = nlp_booking.extract_booking_details(text)
    assert result.location == "Pretoria"
    expected_year = date.today().year
    assert result.date.year == expected_year
    assert (result.date.month, result.date.day) == (8, 6)

    assert result.guests is None
    assert result.event_type in {"Birthday", "Celebration"}


def test_extracts_explicit_year_and_event_type():
    text = "birthday 7 april 2026 for 20 guests in Durban"
    result = nlp_booking.extract_booking_details(text)
    assert result.date.isoformat() == "2026-04-07"
    assert result.event_type == "Birthday"
    assert result.guests == 20


def test_multiple_dates_uses_first():
    text = "Considering 5 May 2025 or 7 May 2025 in Johannesburg"
    result = nlp_booking.extract_booking_details(text)
    assert result.date.isoformat() == "2025-05-05"


def test_ambiguous_location_returns_none():
    text = "Party in Paris or London for 10 guests on 3 June 2025"
    result = nlp_booking.extract_booking_details(text)
    assert result.location is None


def test_typos_are_normalized():
    text = "Planning a frstival for 100 guesds on 25 December 2025 in Cape Town"
    result = nlp_booking.extract_booking_details(text)
    assert result.event_type == "Festival"
    assert result.guests == 100

