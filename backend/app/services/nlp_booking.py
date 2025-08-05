"""Utilities for extracting event details from natural language text."""

from __future__ import annotations

import logging
import re

from dateutil import parser

from ..schemas.nlp import ParsedBookingDetails

logger = logging.getLogger(__name__)

MONTH_PATTERN = (
    "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|"
    "january|february|march|april|june|july|august|september|october|november|december"
)
DATE_RE = re.compile(
    rf"(\d{{1,2}}\s+(?:{MONTH_PATTERN})(?:\s+\d{{4}})?)",
    re.IGNORECASE,
)
LOCATION_RE = re.compile(r"\b(?:in|at)\s+([A-Za-z][A-Za-z ]{2,40})", re.IGNORECASE)
GUEST_RE = re.compile(r"(\d+)\s*(?:guests?|people|attendees)", re.IGNORECASE)


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

    return result
