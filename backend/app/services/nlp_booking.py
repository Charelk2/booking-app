"""Utilities for extracting event details from natural language text."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List
import re
import difflib

import dateparser
import spacy
from spacy.matcher import PhraseMatcher

from ..schemas.nlp import ParsedBookingDetails

logger = logging.getLogger(__name__)


class NLPModelError(RuntimeError):
    """Raised when the NLP model cannot be loaded or used."""


# Attempt to load a spaCy model once at import time. Any failure is logged and
# will raise :class:`NLPModelError` when parsing is attempted.
try:  # pragma: no cover - exercised indirectly
    _NLP = spacy.load("en_core_web_sm")
except Exception as exc:  # pragma: no cover - model load is environment specific
    logger.error("Unable to load spaCy model: %s", exc)
    _NLP = None

_EVENT_TYPES_PATH = (
    Path(__file__).resolve().parents[3] / "frontend" / "src" / "data" / "eventTypes.json"
)
try:
    _EVENT_TYPES = json.loads(_EVENT_TYPES_PATH.read_text())
except FileNotFoundError:  # pragma: no cover - defensive
    logger.warning("eventTypes.json not found at %s", _EVENT_TYPES_PATH)
    _EVENT_TYPES = []

_EVENT_LOOKUP = {e.lower(): e for e in _EVENT_TYPES}
if _NLP and _EVENT_LOOKUP:
    _EVENT_MATCHER = PhraseMatcher(_NLP.vocab, attr="LOWER")
    _EVENT_MATCHER.add("EVENT_TYPE", [_NLP.make_doc(e) for e in _EVENT_LOOKUP])
else:  # pragma: no cover - defensive
    _EVENT_MATCHER = None

_GUEST_TERMS = {"guest", "guests", "people", "attendee", "attendees"}
_VOCABULARY = set(_EVENT_LOOKUP.keys()) | _GUEST_TERMS
_WORD_RE = re.compile(r"\b\w+\b")

LOCATION_FALLBACK_RE = re.compile(
    r"\b(?:in|at)\s+([A-Za-z][A-Za-z ]{2,40})", re.IGNORECASE
)


def _ensure_model() -> spacy.language.Language:
    """Return the loaded spaCy model or raise :class:`NLPModelError`."""

    if _NLP is None:
        raise NLPModelError("spaCy model 'en_core_web_sm' is not available")
    return _NLP


def _extract_first_date(date_strings: List[str]):
    for d in date_strings:
        parsed = dateparser.parse(d)
        if parsed:
            return parsed.date()
    return None


def _normalize_text(text: str) -> str:
    """Correct common booking term typos using a small vocabulary."""

    def replace(match: re.Match[str]) -> str:
        word = match.group(0)
        lower = word.lower()
        if lower in _VOCABULARY:
            return word
        candidates = difflib.get_close_matches(lower, _VOCABULARY, n=1, cutoff=0.8)
        if candidates:
            corrected = candidates[0]
            if word[0].isupper():
                corrected = corrected.title()
            logger.debug("Corrected '%s' to '%s'", word, corrected)
            return corrected
        return word

    return _WORD_RE.sub(replace, text)


def extract_booking_details(text: str) -> ParsedBookingDetails:
    """Extract booking details from free-form text using spaCy."""

    cleaned = text.strip()
    result = ParsedBookingDetails()

    if not cleaned:
        logger.debug("No text provided for NLP parsing")
        return result

    nlp = _ensure_model()
    normalized = _normalize_text(cleaned)
    doc = nlp(normalized)

    # Dates
    date_texts: List[str] = []
    for ent in doc.ents:
        if ent.label_ == "DATE":
            if ent.start > 0 and doc[ent.start - 1].like_num and doc[ent.start - 1].whitespace_:
                date_texts.append(f"{doc[ent.start - 1].text} {ent.text}")
            else:
                date_texts.append(ent.text)
    parsed_date = _extract_first_date(date_texts)
    if parsed_date:
        result.date = parsed_date

    # Locations
    locations = [ent.text for ent in doc.ents if ent.label_ in {"GPE", "LOC"}]
    if len(locations) == 1:
        result.location = locations[0].strip().title()
    elif len(locations) > 1:
        logger.debug("Multiple locations detected; skipping: %s", locations)
    else:
        fallback = LOCATION_FALLBACK_RE.search(normalized)
        if fallback:
            result.location = fallback.group(1).strip().title()

    # Guest count
    for i, token in enumerate(doc):
        if token.like_num and i + 1 < len(doc):
            if doc[i + 1].lemma_.lower() in {"guest", "people", "attendee"}:
                try:
                    result.guests = int(token.text)
                except ValueError:  # pragma: no cover - defensive
                    logger.debug("Invalid guest count detected: %s", token.text)
                break

    # Event type via phrase matcher
    if _EVENT_MATCHER:
        matches = _EVENT_MATCHER(doc)
        if matches:
            match_id, start, end = matches[0]
            event_text = doc[start:end].text.lower()
            result.event_type = _EVENT_LOOKUP.get(event_text)

    return result

