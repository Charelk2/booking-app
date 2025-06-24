from typing import Dict, Optional


BOOKING_DETAILS_PREFIX = "Booking details:"


def parse_booking_details(content: str) -> Dict[str, Optional[str]]:
    """Parse a booking details system message into a dictionary."""
    if not content.startswith(BOOKING_DETAILS_PREFIX):
        return {}
    details: Dict[str, Optional[str]] = {
        "location": None,
        "guests": None,
        "venue_type": None,
    }
    lines = content.splitlines()[1:]
    for line in lines:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower().replace(" ", "_")
        if key in details:
            details[key] = value.strip() or None
    return details
