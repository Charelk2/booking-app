"""Utilities for extracting event details from natural language text."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from dateutil import parser

from ..schemas.nlp import ParsedBookingDetails

logger = logging.getLogger(__name__)

MONTH_PATTERN = (
    "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
    "jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|"
    "nov(?:ember)?|dec(?:ember)?"
)
DATE_RE = re.compile(
    rf"(\d{{1,2}}\s+(?:{MONTH_PATTERN})\b(?:\s+\d{{4}})?)",
    re.IGNORECASE,
)
LOCATION_RE = re.compile(r"\b(?:in|at)\s+([A-Za-z][A-Za-z ]{2,40})", re.IGNORECASE)
GUEST_RE = re.compile(r"(\d+)\s*(?:guests?|people|attendees)", re.IGNORECASE)

_EVENT_TYPES_PATH = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "data"
    / "eventTypes.json"
)
try:
    _EVENT_TYPES = json.loads(_EVENT_TYPES_PATH.read_text())
except FileNotFoundError:  # pragma: no cover - defensive
    logger.warning("eventTypes.json not found at %s", _EVENT_TYPES_PATH)
    _EVENT_TYPES = []

_EVENT_LOOKUP = {e.lower(): e for e in _EVENT_TYPES}
EVENT_RE = (
    re.compile(r"\b(" + "|".join(map(re.escape, _EVENT_LOOKUP.keys())) + r")\b", re.IGNORECASE)
    if _EVENT_LOOKUP
    else None
)


def extract_booking_details(text: str) -> ParsedBookingDetails:
    """Extract basic booking details from free-form text."""

    cleaned = text.strip()
    result = ParsedBookingDetails()

    if not cleaned:
        logger.debug("No text provided for NLP parsing")
        return result

    # Date extraction using a simple pattern to avoid number conflicts
    date_match = DATE_RE.search(cleaned)
    if date_match:
        try:
            result.date = parser.parse(date_match.group(1), dayfirst=False).date()
        except (ValueError, OverflowError) as exc:  # pragma: no cover - debug info
            logger.debug("Date parsing failed: %s", exc)

    # Location heuristic
    loc_match = LOCATION_RE.search(cleaned)
    if loc_match:
        result.location = loc_match.group(1).strip().title()

    # Guest count heuristic
    guest_match = GUEST_RE.search(cleaned)
    if guest_match:
        try:
            result.guests = int(guest_match.group(1))
        except ValueError:  # pragma: no cover - defensive
            logger.debug("Invalid guest count detected: %s", guest_match.group(1))

    # Event type heuristic
    if EVENT_RE:
        event_match = EVENT_RE.search(cleaned)
        if event_match:
            result.event_type = _EVENT_LOOKUP[event_match.group(1).lower()]

    return result
