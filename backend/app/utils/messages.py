from typing import Dict, Optional

from .. import models


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


def preview_label_for_message(
    last_message: Optional["models.Message"],
    thread_state: Optional[str] = None,
    sender_display: Optional[str] = None,
) -> str:
    """Return a concise preview label for a thread list.

    Minimal, safe helper that avoids DB access:
    - QUOTE messages → "Quote from {sender}"
    - Booking-details summaries → "New Booking Request"
    - State=requested fallback → "New Booking Request"
    - Recognize common system lines for payment/confirmation
    - Otherwise, truncate plain text content
    """
    if last_message is None:
        # Fallback when a brand-new thread exists but no chat yet
        if thread_state == "requested":
            return "New Booking Request"
        return ""

    try:
        if last_message.message_type == models.MessageType.QUOTE:
            name = sender_display or "artist"
            return f"Quote from {name}"

        content = last_message.content or ""
        if isinstance(content, str) and content.startswith(BOOKING_DETAILS_PREFIX):
            return "New Booking Request"

        if thread_state == "requested":
            return "New Booking Request"

        # Common system lines
        text = content.strip()
        lower = text.lower()
        if lower.startswith("payment received"):
            return "Payment received"
        if "booking is confirmed" in lower or lower.startswith("booking confirmed"):
            return "Booking confirmed"

        # Fallback snippet
        snippet = text.replace("\n", " ")
        return snippet[:80]
    except Exception:
        return ""
