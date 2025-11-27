import logging
import re
import json
import time
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import date, datetime, time as dtime

from sqlalchemy.orm import Session

from app.models import User as DbUser
from app.schemas.booking_agent import BookingAgentState
from app.services.ai_search import ai_provider_search
from app.crud.crud_service import service as crud_service
from app.services.booking_quote import calculate_quote_breakdown
from app.services.quote_totals import compute_quote_totals_snapshot
from app.core.config import settings
from app.services.genai_client import get_genai_client

logger = logging.getLogger(__name__)


@dataclass
class AgentToolCall:
    """Structured representation of a tool call the agent wants to perform."""

    name: str
    args: Dict[str, Any]


@dataclass
class AgentStepResult:
    """Result of a single agent step.

    This is intentionally generic so an API layer can translate it into
    HTTP-friendly response models for the frontend.
    """

    messages: List[str]
    state: BookingAgentState
    providers: List[Dict[str, Any]]
    tool_calls: List[AgentToolCall]
    final_action: Optional[Dict[str, Any]] = None


def _extract_date_from_text_fragment(text: str) -> Optional[str]:
    """Best-effort extraction of a calendar date from a short text fragment.

    Handles patterns like "29 October" and "29 October 2027". Returns an
    ISO 8601 date string (YYYY-MM-DD) or None on failure.
    """
    t = (text or "").strip().lower()
    if not t:
        return None

    month_map = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "sept": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }

    # Support "29 October" and "29 October 2027" style patterns.
    m = re.search(
        r"\b(\d{1,2})\s+("
        r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
        r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
        r")(?:\s+(\d{4}))?\b",
        t,
    )
    if not m:
        return None

    try:
        day = int(m.group(1))
        month_name = m.group(2)
        year_str = m.group(3)
        month = month_map.get(month_name, None)
        if not month:
            return None

        if year_str:
            year = int(year_str)
        else:
            # If there is an explicit four-digit year anywhere in the text
            # (e.g. “somewhere in October 2027 ... its 30 October ...”),
            # prefer that as the target year so we don’t silently jump back
            # to the current year.
            year_hint = None
            m_year = re.search(r"\b(20\d{2})\b", t)
            if m_year:
                try:
                    year_hint = int(m_year.group(1))
                except Exception:
                    year_hint = None

            if year_hint is not None:
                year = year_hint
            else:
                today = date.today()
                year = today.year
                try:
                    candidate = date(year, month, day)
                    if candidate < today:
                        year += 1
                except Exception:
                    # Fallback: keep current year when candidate construction fails.
                    pass

        return f"{year:04d}-{month:02d}-{day:02d}"
    except Exception:
        return None


def _build_booking_request_from_state(
    state: BookingAgentState,
    message: str,
    BookingRequestCreateCls: Any,
) -> Any:
    """Map BookingAgentState into a BookingRequestCreate-like object.

    This centralises how the agent turns its internal state into the payload
    used by the normal booking-request creation flow so it stays aligned with
    the Booking Wizard over time.
    """
    if not state.chosen_provider_id:
        raise ValueError("chosen_provider_id_required")

    payload: Dict[str, Any] = {
        "artist_id": int(state.chosen_provider_id),
        "message": message,
    }
    if state.service_id:
        try:
            payload["service_id"] = int(state.service_id)
        except Exception:
            pass
    # Best-effort proposed datetime using date + optional time-of-day label.
    if state.date:
        try:
            dt_date = date.fromisoformat(state.date)
            hour = 12
            minute = 0
            if state.time:
                t = state.time.strip().lower()
                m = re.match(r"^(\d{1,2}):(\d{2})$", t)
                if m:
                    h = int(m.group(1))
                    mi = int(m.group(2))
                    if 0 <= h < 24 and 0 <= mi < 60:
                        hour, minute = h, mi
                elif "evening" in t:
                    hour, minute = 18, 0
                elif "afternoon" in t:
                    hour, minute = 15, 0
                elif "morning" in t:
                    hour, minute = 10, 0
            payload["proposed_datetime_1"] = datetime.combine(dt_date, dtime(hour=hour, minute=minute))
        except Exception:
            # Leave proposed_datetime_1 unset if parsing fails; backend can
            # still infer details from the free-text message.
            pass
    return BookingRequestCreateCls(**payload)


def _build_search_payload_from_state(
    query_text: str, state: BookingAgentState, limit: int = 6
) -> Dict[str, Any]:
    """Coerce conversation state into a payload for `ai_provider_search`."""
    # Use existing state as soft filters; the model can still override if needed.
    category = None
    if state.service_category in ("musician", "photographer", "sound_service"):
        category = state.service_category
    location = state.city or None
    when = state.date or None
    min_price = state.budget_min
    max_price = state.budget_max

    payload: Dict[str, Any] = {
        "query": (query_text or "").strip(),
        "category": category,
        "location": location,
        "when": when,
        "min_price": min_price,
        "max_price": max_price,
        "limit": limit,
    }
    return payload


def _call_gemini_parse_state(
    messages: List[Dict[str, str]],
    state: BookingAgentState,
) -> Dict[str, Any]:
    """Ask Gemini to parse the latest user message into structured state fields.

    This helper is deliberately narrow and best-effort: it only attempts to
    interpret event_type, city, date, guests, budget_min, budget_max, venue_type,
    sound, and time from the user's text. On any error or timeout it returns an
    empty dict so the main agent logic can fall back to local heuristics.
    """
    api_key = (getattr(settings, "GOOGLE_GENAI_API_KEY", "") or "").strip()
    model_name = (getattr(settings, "GOOGLE_GENAI_MODEL", "") or "").strip() or "gemini-2.5-flash"
    if not api_key or not model_name:
        return {}

    # Use the latest user message as the primary signal.
    user_messages = [m for m in messages if m.get("role") == "user"]
    last_user = (user_messages[-1].get("content") or "").strip() if user_messages else ""
    if not last_user:
        return {}

    client = get_genai_client()
    if not client:
        logger.warning("Gemini client not available for state parsing; skipping")
        return {}

    # Compact snapshot of the current known state so Gemini can avoid
    # overwriting fields that are already confidently set.
    base_state = {
        "event_type": state.event_type,
        "city": state.city,
        "date": state.date,
        "time": state.time,
        "guests": state.guests,
        "budget_min": state.budget_min,
        "budget_max": state.budget_max,
        "venue_type": state.venue_type,
        "sound": state.sound,
        "sound_mode": state.sound_mode,
        "service_category": state.service_category,
    }

    system_instructions = (
        "You help a booking assistant for a South African event platform (Booka) interpret user messages into "
        "structured event fields. Given the latest user message and the current state, output ONLY a compact JSON "
        "object with any updated fields for: event_type, city, date, time, guests, budget_min, budget_max, "
        "venue_type, sound, sound_mode, service_category.\n\n"
        "Rules:\n"
        "- Use ISO 8601 format (YYYY-MM-DD) for date when possible.\n"
        "- Use 24h 'HH:MM' format for time when possible (e.g. '18:00' for 6pm).\n"
        "- guests should be an integer.\n"
        "- budget_min and budget_max should be numbers in South African Rand (R). Interpret ranges like '5k to 8k' "
        "as 5000 and 8000.\n"
        "- sound should be 'yes' if the user needs sound equipment from the provider, 'no' if sound is already sorted, "
        "or null if unclear.\n"
        "- venue_type can be values like 'indoor', 'outdoor', 'hall', 'restaurant', 'home', 'garden' when hinted.\n"
        "- Only include fields you want to change in the JSON output; omit fields that should stay as they are.\n"
        "- If you are not sure about a field, either omit it or set it to null.\n"
        "- Do not include any explanation or prose outside the JSON.\n"
    )

    base_json = json.dumps(base_state, default=str)
    prompt = (
        f"{system_instructions}\n\n"
        f"Current state (JSON): {base_json}\n"
        f"Latest user message: {last_user}\n\n"
        "Respond with JSON only, for example:\n"
        '{"event_type": "birthday", "city": "Pretoria", "date": "2026-10-29", "guests": 80, "budget_min": 5000, "budget_max": 8000}\n'
    )

    try:
        t0 = time.monotonic()
        res = client.models.generate_content(
            model=model_name,
            contents=prompt,
        )
        dt_ms = int((time.monotonic() - t0) * 1000)
        logger.info("booking_agent: gemini_parse_ms=%s", dt_ms)
        text = (getattr(res, "text", None) or "").strip()
        if not text:
            return {}
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            json_str = text[start : end + 1]
        else:
            json_str = text
        data = json.loads(json_str)
        if not isinstance(data, dict):
            return {}
    except Exception as exc:
        logger.warning("Gemini state parsing failed: %s", exc)
        return {}

    # Normalise and whitelist only supported fields before returning.
    allowed_keys = {
        "event_type",
        "city",
        "date",
        "time",
        "guests",
        "budget_min",
        "budget_max",
        "venue_type",
        "sound",
        "sound_mode",
        "service_category",
    }
    update: Dict[str, Any] = {}
    for key, value in data.items():
        if key not in allowed_keys:
            continue
        # Let the main agent decide how to validate/merge; keep conversion light.
        if key in ("guests",):
            try:
                update[key] = int(value) if value is not None else None
            except Exception:
                continue
        elif key in ("budget_min", "budget_max"):
            try:
                update[key] = float(value) if value is not None else None
            except Exception:
                continue
        else:
            update[key] = value
    return update


def _classify_intent_and_event_type(
    query_text: str,
    state: BookingAgentState,
) -> Tuple[Optional[str], Optional[str]]:
    """Heuristic classifier for high-level intent and event_type.

    This is intentionally small and deterministic. It prefers existing state
    values and only sets intent/event_type when they are unknown.
    """
    intent: Optional[str] = state.intent or None
    event_type: Optional[str] = state.event_type or None

    t = (query_text or "").strip().lower()
    if not t:
        return intent, event_type

    # Event type classification: wedding / birthday / corporate / other.
    if not event_type:
        if "wedding" in t or "bride" in t or "reception" in t:
            event_type = "wedding"
        elif "birthday" in t or "b-day" in t or "bday" in t or "turning" in t:
            event_type = "birthday"
        elif (
            "corporate" in t
            or "office party" in t
            or "year-end" in t
            or "year end" in t
            or "conference" in t
        ):
            event_type = "corporate"

    # Intent classification.
    general_keywords = [
        "booka",
        "how does booka",
        "how does this work",
        "how do payments",
        "payment",
        "pay ",
        "paid ",
        "refund",
        "refunded",
        "cancellation",
        "cancel ",
        "cancelled",
        "policy",
        "deposit",
        "commission",
        "fee",
        "fees",
        "safe is it safe",
        "scam",
        "legit",
    ]
    search_keywords = [
        "looking for",
        "need a ",
        "need an ",
        "find a ",
        "dj",
        "band",
        "musician",
        "muscician",
        "singer",
        "photographer",
        "videographer",
        "sound system",
        "acoustic duo",
        "service provider",
        "artist ",
    ]

    if any(k in t for k in general_keywords) and not any(k in t for k in search_keywords):
        intent = "general_question"
    else:
        # Try to detect explicit "book this provider" phrasing.
        if ("book " in t or "let's book" in t or "lets book" in t) and (state.chosen_provider_id or state.chosen_provider_name):
            intent = "book_named_provider"
        # When we already have some brief filled in and user talks about
        # changing details, treat as modify_brief.
        elif (
            (state.city or state.date or state.guests or state.budget_min or state.budget_max)
            and any(
                k in t
                for k in (
                    "actually",
                    "instead",
                    "rather",
                    "change",
                    "different date",
                    "move it",
                    "make it",
                )
            )
        ):
            intent = "modify_brief"
        # Default to provider discovery.
        elif not intent:
            intent = "find_provider"

    return intent, event_type


def _classify_service_category(
    query_text: str,
    state: BookingAgentState,
) -> Optional[str]:
    """Heuristic classifier for high-level service category.

    Maps free-form text into coarse categories like 'musician', 'photographer',
    or 'sound_service'. Existing state.service_category takes precedence when
    the text is ambiguous.
    """
    category: Optional[str] = state.service_category or None
    t = (query_text or "").strip().lower()
    if not t:
        return category

    # Simple "no music / we already have a band" detector so we don't stay in
    # a musician lane when the user explicitly excludes it.
    negative_music = bool(
        re.search(r"\b(no|not)\s+(a\s+)?(musician|band|dj|deejay)\b", t)
        or "no live music" in t
        or "no music" in t
        or "already have a band" in t
        or "already have a dj" in t
        or "already have a musician" in t
        or "already booked the band" in t
        or "already booked a band" in t
    )

    # Photographer / photo-oriented.
    if any(k in t for k in ["photographer", "photoshoot", "photo shoot", "pictures", "photos"]):
        return "photographer"

    # Musicians / bands / DJs / singers. Skip when the user has explicitly
    # said they do NOT want music or already have it covered.
    if not negative_music and any(
        k in t
        for k in [
            "musician",
            "muscician",
            "musicians",
            "band",
            "bands",
            "dj",
            "deejay",
            "singer",
            "singers",
            "trio",
            "duo",
            "quartet",
            "live music",
        ]
    ):
        return "musician"

    # Sound / PA / audio hire. When we are already in a musician lane or have
    # a chosen provider (e.g. the user said "a musician please" and then "I
    # need sound equipment"), treat sound phrases as production needs for that
    # artist rather than switching the service category to sound_service,
    # unless the user explicitly said they don't want a musician and only
    # need sound.
    sound_keywords = [
        "sound system",
        "pa system",
        "pa hire",
        "audio hire",
        "sound hire",
        "sound equipment",
        "speaker hire",
    ]
    if any(k in t for k in sound_keywords):
        sound_only = any(
            phrase in t
            for phrase in [
                "only sound",
                "just sound",
                "sound only",
                "only a sound system",
                "just a sound system",
            ]
        )
        if sound_only or negative_music:
            return "sound_service"
        is_musician_lane = (category or "").lower() in ("musician", "dj", "band")
        if is_musician_lane or state.chosen_provider_id:
            return category or "musician"
        return "sound_service"

    return category


def _is_musician_category(state: BookingAgentState) -> bool:
    """Return True when the current service category is a live performance."""
    return (state.service_category or "").lower() in ("musician", "dj", "band")


def _has_required_booking_fields(state: BookingAgentState) -> bool:
    """Return True when we have enough structured info to safely book.

    This enforces a minimal parity with the Booking Wizard: before offering a
    booking or actually creating one, we require at least an event_type, city,
    date, guest count, and an explicit sound preference. Venue type and
    detailed production fields can still be clarified later in the thread
    or via the normal booking flow.
    """
    try:
        if not (state.event_type and str(state.event_type).strip()):
            return False
        if not (state.city and str(state.city).strip()):
            return False
        if not (state.date and str(state.date).strip()):
            return False
        if state.guests is None or int(state.guests) <= 0:
            return False
        if state.sound not in ("yes", "no"):
            return False
        return True
    except Exception:
        return False


def tool_search_providers(
    db: Session, query_text: str, state: BookingAgentState, limit: int = 6
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Wrapper around ai_provider_search for use by the booking agent.

    Returns a tuple of (providers, filters_dict).
    """
    payload = _build_search_payload_from_state(query_text, state, limit=limit)
    # Skip LLM-derived filters and rerank/explanations when invoked from the
    # booking agent; the agent already calls Gemini for conversational text,
    # so we keep search deterministic here to reduce latency.
    payload["disable_llm"] = True
    try:
        result = ai_provider_search(db, payload)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Agent search_providers failed: %s", exc)
        return [], {}

    providers = result.get("providers") or []
    filters = result.get("filters") or {}
    return providers, filters


def tool_check_availability(
    db: Session, artist_id: int, when_str: str
) -> str:
    """Check availability for a provider on a specific date.

    Returns one of: 'available', 'unavailable', 'unknown'.
    """
    if not artist_id or not when_str:
        return "unknown"
    try:
        from app.api.v1.api_service_provider import read_artist_availability  # local import to avoid cycles

        when = date.fromisoformat(when_str)
        data = read_artist_availability(artist_id=artist_id, when=when, db=db)  # type: ignore[call-arg]
        unavailable = (data or {}).get("unavailable_dates") or []
        return "unavailable" if when_str in unavailable else "available"
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Agent check_availability failed: %s", exc)
        return "unknown"


def tool_create_booking_request(
    db: Session,
    current_user: DbUser,
    state: BookingAgentState,
    *,
    message: str,
) -> Optional[int]:
    """Create a booking request based on the current agent state.

    This is a thin wrapper around the existing booking-request creation logic
    so the agent can reuse the same validations, notifications, and side
    effects as the normal Booking Wizard flow.
    """
    if not current_user or not getattr(current_user, "id", None):
        logger.warning("Agent attempted to create booking without an authenticated user")
        return None
    if not state.chosen_provider_id:
        logger.warning("Agent attempted to create booking without a chosen provider")
        return None

    try:
        from app.api import api_booking_request  # local import to avoid cycles
        from app.schemas.request_quote import BookingRequestCreate
        from app.models.request_quote import BookingRequest as BookingRequestModel
        from app.models.booking_status import BookingStatus
    except Exception as exc:  # pragma: no cover
        logger.error("Agent booking_request imports failed: %s", exc)
        return None

    artist_id = int(state.chosen_provider_id)

    # Idempotency: if the client already has a recent, open booking request
    # with this artist on the same date, reuse it instead of creating a new
    # one. This avoids duplicates when the user confirms twice or retries.
    try:
        if state.date:
            dt_date = date.fromisoformat(state.date)
            day_start = datetime.combine(dt_date, dtime.min)
            day_end = datetime.combine(dt_date, dtime.max)
            existing = (
                db.query(BookingRequestModel)
                .filter(
                    BookingRequestModel.client_id == int(current_user.id),
                    BookingRequestModel.artist_id == artist_id,
                    BookingRequestModel.status.in_(
                        [
                            BookingStatus.DRAFT,
                            BookingStatus.PENDING_QUOTE,
                        ]
                    ),
                    BookingRequestModel.proposed_datetime_1 >= day_start,
                    BookingRequestModel.proposed_datetime_1 <= day_end,
                )
                .order_by(BookingRequestModel.id.desc())
                .first()
            )
            if existing is not None:
                logger.info(
                    "Agent idempotent booking hit; reusing booking_request_id=%s for user_id=%s artist_id=%s date=%s",
                    getattr(existing, "id", None),
                    getattr(current_user, "id", None),
                    artist_id,
                    state.date,
                )
                try:
                    return int(getattr(existing, "id", 0) or 0) or None
                except Exception:
                    return None
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Agent idempotency check failed: %s", exc)

    # Compose the BookingRequestCreate payload using the shared helper so the
    # agent's mapping from conversational state to booking-request shape
    # stays aligned with the Booking Wizard over time.
    try:
        req = _build_booking_request_from_state(
            state=state,
            message=message,
            BookingRequestCreateCls=BookingRequestCreate,
        )
    except ValueError as exc:
        logger.warning("Agent build_booking_request_from_state failed: %s", exc)
        return None

    try:
        new_req = api_booking_request.create_booking_request(  # type: ignore[arg-type]
            request_in=req,
            db=db,
            current_user=current_user,
        )
        # Pydantic / SQLAlchemy object; ensure id attribute is accessible.
        booking_request_id = int(getattr(new_req, "id", 0) or 0)
        if booking_request_id <= 0:
            return None
        return booking_request_id
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Agent failed to create booking request: %s", exc, exc_info=True)
        return None


def tool_pick_primary_service(
    db: Session,
    artist_id: int,
) -> Tuple[Optional[int], Optional[str], Optional[float]]:
    """Pick a representative service for an artist for quote previews.

    Heuristic: choose the approved service with the lowest non-zero price.
    Returns (service_id, service_name, price) or (None, None, None) on failure.
    """
    if not artist_id:
        return None, None, None
    try:
        services = crud_service.get_services_by_artist(db, artist_id=artist_id, skip=0, limit=50)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Agent get_services_by_artist failed: %s", exc)
        return None, None, None
    best_id: Optional[int] = None
    best_name: Optional[str] = None
    best_price: Optional[float] = None
    for svc in services or []:
        # Skip non-approved services if status is present
        status = getattr(svc, "status", "approved")
        if status != "approved":
            continue
        raw_price = getattr(svc, "price", None)
        try:
            price = float(raw_price) if raw_price is not None else None
        except Exception:
            price = None
        if price is None or price <= 0:
            continue
        if best_price is None or price < best_price:
            best_price = price
            try:
                best_id = int(getattr(svc, "id", 0) or 0)
            except Exception:
                best_id = None
            name = getattr(svc, "title", None) or getattr(svc, "name", None) or None
            best_name = str(name) if name else None
    if not best_id:
        return None, None, None
    return best_id, best_name, best_price


def tool_quote_preview(
    db: Session,
    state: BookingAgentState,
) -> Optional[float]:
    """Compute a travel- and sound-aware quote preview including Booka fees and VAT.

    Returns the estimated client_total_incl_vat as a float, or None if a
    preview cannot be computed safely.
    """
    if not state.service_id or not state.city:
        return None
    try:
        svc = crud_service.get_service(db, service_id=int(state.service_id))
    except Exception as exc:  # pragma: no cover
        logger.warning("Agent quote_preview get_service failed: %s", exc)
        return None
    if not svc:
        return None
    try:
        raw_fee = getattr(svc, "price", None)
        base_fee = float(raw_fee) if raw_fee is not None else None
    except Exception:
        base_fee = None
    if base_fee is None or base_fee <= 0:
        return None
    try:
        from decimal import Decimal

        breakdown = calculate_quote_breakdown(
            base_fee=Decimal(str(base_fee)),
            distance_km=None,
            accommodation_cost=None,
            service=svc,
            event_city=state.city,
            db=db,
            guest_count=state.guests,
            venue_type=state.venue_type,
            stage_required=state.stage_required,
            stage_size=state.stage_size,
            lighting_evening=state.lighting_evening,
            upgrade_lighting_advanced=state.lighting_upgrade_advanced,
            backline_required=state.backline_required,
            selected_sound_service_id=state.sound_supplier_service_id,
            supplier_distance_km=None,
            rider_units=None,
            backline_requested=None,
        )
        total = breakdown.get("total")
        if total is None:
            return None
        snapshot = compute_quote_totals_snapshot(
            {"total": total, "subtotal": total, "currency": getattr(svc, "currency", "ZAR")}
        )
        if not snapshot or snapshot.client_total_incl_vat is None:
            return None
        return float(snapshot.client_total_incl_vat)
    except Exception as exc:  # pragma: no cover
        logger.warning("Agent quote_preview failed: %s", exc, exc_info=True)
        return None


def _call_gemini_reply(
    messages: List[Dict[str, str]],
    state: BookingAgentState,
    providers: List[Dict[str, Any]],
    filters: Dict[str, Any],
    requested_artist_name: Optional[str] = None,
    requested_artist_found: bool = False,
) -> Optional[List[str]]:
    """Ask Gemini to craft a natural assistant reply for the current turn.

    This helper is deliberately narrow: it does not call tools or mutate state.
    It only generates human-friendly text based on the latest user message,
    current state, and the latest provider search results.
    """
    api_key = (getattr(settings, "GOOGLE_GENAI_API_KEY", "") or "").strip()
    model_name = (getattr(settings, "GOOGLE_GENAI_MODEL", "") or "").strip() or "gemini-2.5-flash"
    if not api_key or not model_name:
        return None

    client = get_genai_client()
    if not client:
        logger.warning("Gemini client not available; booking agent falling back to heuristics")
        return None

    # Latest user message for immediate context.
    user_messages = [m for m in messages if m.get("role") == "user"]
    last_user = (user_messages[-1]["content"] or "").strip() if user_messages else ""

    # Summarize top provider for context, including a rough starting price
    # when available so Gemini can speak about “from R…” in a grounded way.
    top = providers[0] if providers else None
    top_summary = None
    if top:
        name = str(top.get("name") or "this provider")
        city = str(top.get("location") or "")
        rating = top.get("rating")
        reviews = top.get("review_count")
        bookings = top.get("booking_count")
        client_total_preview = top.get("client_total_preview")
        starting_price = top.get("starting_price")
        parts = [name]
        if city:
            parts.append(f"in {city}")
        metrics: List[str] = []
        if rating is not None:
            metrics.append(f"{rating:.1f} rating")
        if reviews:
            metrics.append(f"{int(reviews)} reviews")
        if bookings:
            metrics.append(f"{int(bookings)} bookings")
        if metrics:
            parts.append("with " + ", ".join(metrics))
        is_musician = _is_musician_category(state)
        if is_musician:
            if state.quote_total_preview is not None:
                try:
                    approx = int(round(float(state.quote_total_preview)))
                    parts.append(
                        f"typical bookings like this on Booka are around R{approx} including Booka fees and VAT "
                        "with travel and sound factored into the quote."
                    )
                except Exception:
                    pass
            elif starting_price is not None:
                try:
                    parts.append(
                        f"performance fee typically starts from about R{round(float(starting_price))} "
                        "(travel and sound extra)."
                    )
                except Exception:
                    pass
        else:
            if client_total_preview is not None:
                try:
                    parts.append(
                        f"typical Booka bookings starting from about R{round(float(client_total_preview))} "
                        "including Booka fees and VAT."
                    )
                except Exception:
                    pass
            elif starting_price is not None:
                try:
                    parts.append(f"base performance fee from about R{round(float(starting_price))} (travel and sound extra).")
                except Exception:
                    pass
        top_summary = " ".join(parts)

    # High-level known / unknown fields to help Gemini ask useful follow-ups.
    known_fields = {
        "event_type": state.event_type,
        "service_category": state.service_category,
        "city": state.city or filters.get("location"),
        "date": state.date or filters.get("when"),
        "guests": state.guests,
        "sound_needed": state.sound,
        # Budget is intentionally not part of the ask/follow-up flow; the UI
        # shows price options via cards, so the assistant does not need to
        # interrogate budget in chat.
    }
    missing = [k for k, v in known_fields.items() if not v]

    # Derive which fields we are willing to ask about on this turn so we can
    # avoid repeating the same follow-up questions. Budget should not dominate
    # the conversation: only include budget_min/budget_max in follow-ups when
    # the user has clearly brought up money/price, or when they have already
    # given a budget and we are clarifying it. Stage/lighting/backline are
    # deliberately excluded here to keep the conversation snappy.
    asked = list(state.asked_fields or [])
    answered = list(state.answered_fields or [])
    askable = [k for k in missing if k not in asked and k not in answered]
    ask_about: List[str] = []
    # In general_question mode, avoid asking for booking details; focus on
    # answering the product question instead.
    if state.intent != "general_question":
        # For live performance categories (musician/DJ/band), prioritise
        # clarifying which kind of service the user wants (service_category),
        # then the core booking fields needed to move toward a concrete
        # artist/booking offer. Budget is handled visually via cards in the UI.
        if _is_musician_category(state):
            preferred_order = [
                "service_category",
                "city",
                "date",
                "guests",
                "sound_needed",
                "event_type",
            ]
            order_index = {key: idx for idx, key in enumerate(preferred_order)}
            askable.sort(key=lambda key: order_index.get(key, len(preferred_order)))

        filtered: List[str] = []
        for key in askable:
            filtered.append(key)

        askable = filtered
        ask_about = askable[:2]
        for key in ask_about:
            if key not in state.asked_fields:
                state.asked_fields.append(key)

    # Budget sensitivity is handled visually via UI cards that show prices.
    # The conversational agent does not enforce or probe budget thresholds.
    budget_hint: Optional[str] = None

    # Rough "days to event" and last-minute flag so the assistant can adapt
    # tone for very near-term events.
    days_to_event: Optional[int] = None
    is_last_minute = False
    try:
        when_str = state.date or filters.get("when")
        if when_str:
            dt = date.fromisoformat(str(when_str))
            today = date.today()
            days_to_event = (dt - today).days
            if 0 <= days_to_event <= 7:
                is_last_minute = True
    except Exception:
        days_to_event = None
        is_last_minute = False

    system_instructions = (
        "You are Booka's booking assistant. Booka is a South African platform where people book artists and other "
        "service providers (bands, DJs, musicians, MCs, photographers, videographers, sound/lighting, venues, etc.) "
        "for events like weddings, birthdays, and corporate functions.\n\n"
        "High-level facts about Booka you can rely on:\n"
        "- Bookings usually start as a booking request to a specific provider; the provider can then send a quote.\n"
        "- Pricing shown as “from R…” is a starting point and full quotes can include travel, sound, lighting, and Booka fees.\n"
        "- Artists and suppliers can travel between cities; distance just affects the quote via travel/accommodation costs.\n"
        "- Clients and providers can chat via an in-app message thread attached to a booking request.\n"
        "- Payments are handled through Booka's payment flow (for example via Paystack) and bookings are confirmed after payment.\n"
        "- Each artist can have their own cancellation / change policy on their profile; you should not invent specific legal terms.\n\n"
        "Reasoning rules:\n"
        "- You only reason about popularity and bookings ON Booka, never outside of it (no claims about who is famous in all of South Africa).\n"
        "- You see the user's latest message, the current booking state (event type, city, date, guests, venue and sound needs, service_category), "
        "and a short summary of the top matching provider if any.\n"
        "- The context also includes a list of which fields are still missing, plus which ones you have already asked about. "
        "Do NOT ask for details that already appear in the known state or in asked_fields/answered_fields. "
        "Only ask about fields that are explicitly listed as ask_about (if any), and at most 1–2 follow-up questions at a time.\n"
        "- You may be told about a specific artist the user asked for via requested_artist_name and requested_artist_found:\n"
        "  * If requested_artist_found is true, that means the artist they asked for appears in the current Booka results. "
        "Talk about that artist directly and do NOT say they are not listed on Booka.\n"
        "  * If requested_artist_found is false, you may say that you cannot see them in the current matches, but you MUST NOT "
        "claim they are “not on Booka” or “not listed on Booka”, because you do not have global knowledge of the platform.\n"
        "- Artists can travel. If the artist's home city is different from the event city, do NOT imply they cannot be booked. "
        "Explain that travel will be added to the quote and, only if the user explicitly prefers someone closer, mention that you can "
        "suggest artists based nearer to the event.\n"
        "- Budget is handled visually via price cards in the UI; you do not need to interrogate budget in chat.\n"
        "- You may see a days_to_event value or a last_minute flag. When an event is very soon (last_minute is true or days_to_event <= 7), "
        "acknowledge that it is short notice and encourage flexibility on exact time or artist without sounding alarmist.\n\n"
        "How to respond:\n"
        "- First, acknowledge and correctly restate what the user has told you so far (event type, city, date, guests, sound/stage needs) "
        "so they can see you remember it.\n"
        "- If a top provider is available, mention them, why they fit, and a rough starting price if provided (e.g. “from about R12 000 on Booka, "
        "before travel and sound”).\n"
        "- If the user is asking a general question about Booka (how it works, payments, safety, cancellation, availability of certain services), "
        "answer that clearly using the facts above, then optionally offer to help them start a booking.\n"
        "- If the user is refining an existing event (changing date, city, guests, budget, or provider), update your wording accordingly and avoid "
        "re-asking for details you already know.\n"
        "- Do NOT talk about tools, APIs, or internal implementation details; just sound like a knowledgeable human assistant.\n"
        "- Keep replies to 1–3 short sentences and avoid repeating the same question in consecutive turns.\n"
    )

    context_lines: List[str] = []
    if top_summary:
        context_lines.append(f"Top provider: {top_summary}.")
    context_lines.append(f"Known state: {known_fields}.")
    if missing:
        context_lines.append(f"Missing fields: {', '.join(missing)}.")
    if state.asked_fields:
        context_lines.append(f"Asked_fields: {state.asked_fields}.")
    if state.answered_fields:
        context_lines.append(f"Answered_fields: {state.answered_fields}.")
    if ask_about:
        context_lines.append(f"Ask_about_this_turn: {ask_about}.")
    if state.availability_status:
        context_lines.append(
            f"Availability_status_for_chosen_provider: {state.availability_status!r}."
        )
    if days_to_event is not None:
        context_lines.append(
            f"Days_to_event: {days_to_event}, last_minute={is_last_minute}."
        )
    if budget_hint:
        context_lines.append(f"Budget_hint: {budget_hint}.")
    if requested_artist_name:
        context_lines.append(
            f"Requested artist: {requested_artist_name!r}, found_in_results={requested_artist_found}."
        )

    prompt = (
        f"{system_instructions}\n"
        f"Latest user message: {last_user or '(none)'}\n"
        f"{' '.join(context_lines)}\n\n"
        "Respond as the assistant with natural language only."
    )

    try:
        t0 = time.monotonic()
        # HTTP timeout is enforced via the shared client configuration.
        res = client.models.generate_content(
            model=model_name,
            contents=prompt,
        )
        dt_ms = int((time.monotonic() - t0) * 1000)
        logger.info("booking_agent: gemini_reply_ms=%s", dt_ms)
        text = (getattr(res, "text", None) or "").strip()
        if not text:
            return None
        # Guardrail: if we know the requested artist is present in the current
        # results, never allow wording that claims we "don't see" them or that
        # they are not listed on Booka. Replace such replies with a safe,
        # deterministic variant that acknowledges the artist correctly.
        if requested_artist_found and requested_artist_name:
            lower = text.lower()
            artist_l = requested_artist_name.lower()
            if artist_l in lower and (
                "don't see" in lower
                or "do not see" in lower
                or "not listed" in lower
                or "isn't currently listed" in lower
                or "isnt currently listed" in lower
            ):
                text = (
                    f"You're looking for {requested_artist_name}. I can see them in your Booka results for this search, "
                    "and can also suggest similar artists if needed. Tell me the event date and roughly how many guests "
                    "you expect so I can refine options."
                )
        return [text]
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Gemini booking agent reply failed: %s", exc)
        return None


def run_booking_agent_step(
    db: Session,
    current_user: DbUser,
    messages: List[Dict[str, str]],
    state: Optional[BookingAgentState] = None,
) -> AgentStepResult:
    """Single conversational step for the booking agent.

    This implementation combines deterministic provider search with an
    optional Gemini-powered reply generator. If Gemini is not configured or
    fails, the agent falls back to a simple heuristic response.
    """
    state = state or BookingAgentState()
    if state.stage is None:
        state.stage = "collecting_requirements"

    # Extract recent user messages as the primary query signal so earlier
    # provider mentions (e.g. names) stay in context across follow-ups.
    user_messages = [m for m in messages if m.get("role") == "user"]
    recent_texts = [
        (m.get("content") or "").strip()
        for m in user_messages[-3:]
        if (m.get("content") or "").strip()
    ]
    query_text = " ".join(recent_texts).strip() if recent_texts else ""

    # Treat the very first user turn with an empty booking state as a special
    # "fast path" turn so we can respond quickly without waiting on Gemini or
    # heavy quote/availability calculations.
    is_first_user_turn = (
        len(user_messages) == 1
        and not state.chosen_provider_id
        and not state.city
        and not state.date
        and state.guests is None
        and state.budget_min is None
        and state.budget_max is None
    )

    prev_date = state.date

    # Classify high-level intent and event_type before running search so we
    # can avoid unnecessary work for general Booka questions.
    intent, event_type = _classify_intent_and_event_type(query_text, state)
    if event_type and not state.event_type:
        state.event_type = event_type
    if intent:
        state.intent = intent

    # Classify coarse service category (musician / photographer / sound_service)
    # and, when it changes, reset provider-specific state so the agent can
    # switch tracks without clinging to the previous artist.
    prev_category = state.service_category
    new_category = _classify_service_category(query_text, state)
    if new_category and new_category != prev_category:
        state.service_category = new_category
        state.chosen_provider_id = None
        state.chosen_provider_name = None
        state.service_id = None
        state.service_name = None
        state.availability_checked = False
        state.availability_status = None
        state.availability_message_emitted = False
        state.stage = "collecting_requirements"
        state.summary_emitted = False

    # Best-effort Gemini parser: let the model propose structured updates to
    # the booking state based on the latest user message (date, city, guests,
    # budget, sound, etc.). This runs only when we have missing fields, we are
    # not in general-question mode, and we are past the first user turn, and
    # it is strictly best-effort with a short timeout.
    if (
        not is_first_user_turn
        and state.intent != "general_question"
        and (state.city is None or state.date is None or state.guests is None or (state.budget_min is None and state.budget_max is None))
    ):
        try:
            parsed = _call_gemini_parse_state(messages, state)
            for key, value in parsed.items():
                # When the user is changing details (modify_brief intent),
                # we allow Gemini to overwrite previous values. Otherwise we
                # only fill fields that are currently unset so user overrides
                # and backend heuristics remain authoritative.
                if state.intent == "modify_brief":
                    setattr(state, key, value)
                else:
                    if getattr(state, key, None) is None:
                        setattr(state, key, value)
        except Exception:
            # Parsing must never break the agent step.
            pass

    if state.intent == "general_question":
        providers = []
        filters = {}
    else:
        # Only hit search once we have a clear service intent (category) or the
        # latest user message is explicitly asking to look/book for something.
        # Additionally, when the latest message looks like a provider name
        # (e.g. "Charel Kleinhans") without event keywords, treat it as a
        # direct artist lookup and run search so we can resolve the name.
        last_user_text = (user_messages[-1].get("content") or "").strip().lower() if user_messages else ""
        name_like = False
        if last_user_text:
            try:
                tokens = re.findall(r"[a-z0-9]+", last_user_text)
                # Consider short texts without obvious event keywords as
                # potential names (e.g. "charel kleinhans").
                if 1 <= len(tokens) <= 5:
                    event_words = {
                        "wedding",
                        "birthday",
                        "party",
                        "corporate",
                        "conference",
                        "event",
                        "guests",
                        "people",
                        "year",
                        "years",
                    }
                    if not any(w in last_user_text for w in event_words):
                        name_tokens = [t for t in tokens if len(t) >= 3]
                        if name_tokens:
                            name_like = True
            except Exception:
                name_like = False
        should_search = bool(
            state.service_category
            or "looking for" in last_user_text
            or "need a " in last_user_text
            or "need an " in last_user_text
            or "book " in last_user_text
            or name_like
        )
        if should_search:
            t_search_start = time.monotonic()
            providers, filters = tool_search_providers(db, query_text, state)
            search_ms = int((time.monotonic() - t_search_start) * 1000)
            try:
                logger.info("booking_agent: search_ms=%s", search_ms)
            except Exception:
                pass
        else:
            providers = []
            filters = {}

    # After search, prefer providers that match the current lane. For musician
    # lanes, de-emphasise pure sound-service providers so the agent doesn't
    # suggest booking a sound-only supplier when the user asked for live
    # performance.
    if providers and _is_musician_category(state):
        try:
            filtered_providers: List[Dict[str, Any]] = []
            for p in providers:
                cats = p.get("categories") or []
                cats_l = [str(c).lower() for c in cats]
                has_musician_category = any(
                    any(keyword in cat for keyword in ("musician", "band", "dj", "mc", "host"))
                    for cat in cats_l
                )
                has_only_sound_categories = bool(cats_l) and all("sound" in cat for cat in cats_l)
                # Keep providers that clearly have musician-like categories,
                # and also those with unknown/mixed categories, but drop
                # providers that are pure sound-service when we are in a
                # musician lane.
                if has_musician_category or not has_only_sound_categories:
                    filtered_providers.append(p)
            if filtered_providers:
                providers = filtered_providers
        except Exception:
            # Provider filtering must never break the agent.
            pass

    # Detect whether the user is clearly asking for a specific artist by name
    # and whether that artist appears in the current provider list.
    requested_artist_name: Optional[str] = None
    requested_artist_id: Optional[int] = None
    if providers and user_messages:
        try:
            last_user = (user_messages[-1].get("content") or "").strip().lower()
            if last_user:
                for p in providers:
                    raw_name = p.get("name")
                    if not raw_name:
                        continue
                    name = str(raw_name).strip()
                    name_l = name.lower()
                    # Simple containment check: if the full artist name appears
                    # in the latest user message, treat it as an explicit
                    # request for that artist.
                    if name_l and name_l in last_user:
                        requested_artist_name = name
                        try:
                            requested_artist_id = int(p.get("artist_id") or 0) or None
                        except Exception:
                            requested_artist_id = None
                        break
        except Exception:
            # Name detection is best-effort only; never break the agent.
            requested_artist_name = None
            requested_artist_id = None

    # Lightweight extraction of a few structured fields from the latest user
    # message so we can progressively fill the state (e.g. sound preference).
    try:
        t = (query_text or "").lower()
        # Best-effort date extraction from recent user text. When we can
        # confidently parse a concrete calendar date, let the newest mention
        # win so users can refine from “somewhere in October 2027” to “30
        # October” without needing special phrasing.
        extracted_date = _extract_date_from_text_fragment(t)
        if extracted_date and extracted_date != state.date:
            state.date = extracted_date
        if state.sound is None:
            if re.search(r"\b(no sound|without sound|have our own sound|sound is sorted)\b", t):
                state.sound = "no"
            elif "sound system" in t or "sound equipment" in t or "need sound" in t:
                state.sound = "yes"
        if state.guests is None:
            m = re.search(r"(\d{1,4})\s+(guests?|people|pax)", t)
            if m:
                try:
                    state.guests = int(m.group(1))
                except Exception:
                    pass
        if state.venue_type is None:
            if "outdoor" in t or "outside" in t or "garden" in t:
                state.venue_type = "outdoor"
            elif "indoor" in t or "inside" in t or "hall" in t:
                state.venue_type = "indoor"
        if state.stage_required is None:
            if re.search(r"\b(stage|staging)\b", t):
                # Assume stage is required unless explicitly negated.
                if not re.search(r"\b(no stage|without stage)\b", t):
                    state.stage_required = True
            elif re.search(r"\b(no stage|without stage)\b", t):
                state.stage_required = False
        if state.stage_required and state.stage_size is None:
            if "small stage" in t:
                state.stage_size = "S"
            elif "medium stage" in t or "mid-size stage" in t:
                state.stage_size = "M"
            elif "large stage" in t or "big stage" in t:
                state.stage_size = "L"
        if state.lighting_evening is None:
            if "evening" in t and "light" in t:
                state.lighting_evening = True
        if state.backline_required is None and "backline" in t:
            state.backline_required = True
    except Exception:
        # State extraction must never break the agent step.
        pass

    # Update coarse filters into state so follow-up turns can refine them.
    if filters:
        loc = filters.get("location") or None
        when = filters.get("when") or None
        if state.city is None or state.intent == "modify_brief":
            if loc:
                state.city = loc
        if state.date is None or state.intent == "modify_brief":
            if when:
                if isinstance(when, date):
                    state.date = when.isoformat()
                elif isinstance(when, str):
                    try:
                        parsed_when = date.fromisoformat(when)
                        state.date = parsed_when.isoformat()
                    except Exception:
                        pass
        try:
            if state.budget_min is None and filters.get("min_price") is not None:
                state.budget_min = float(filters["min_price"])
        except Exception:
            pass
        try:
            if state.budget_max is None and filters.get("max_price") is not None:
                state.budget_max = float(filters["max_price"])
        except Exception:
            pass

    # Mark fields that now have values as "answered" so we can avoid asking
    # about them again in follow-up questions.
    answered_pairs = [
        ("event_type", state.event_type),
        ("city", state.city),
        ("date", state.date),
        ("guests", state.guests),
        ("budget_min", state.budget_min),
        ("budget_max", state.budget_max),
        ("venue_type", state.venue_type),
        ("sound", state.sound),
    ]
    for key, value in answered_pairs:
        if value is not None and key not in state.answered_fields:
            state.answered_fields.append(key)

    # If the event date changed during this turn, invalidate any previous
    # availability check so we can re-check for the new date and emit a fresh
    # availability message at most once for the new date.
    try:
        if prev_date != state.date:
            state.availability_checked = False
            state.availability_status = None
            state.availability_message_emitted = False
    except Exception:
        pass

    # Keep a heuristic chosen provider to mirror current UX, but avoid
    # swapping providers once the user is confirming a booking. When the user
    # clearly asks for a specific artist by name and that artist appears in
    # the results, prefer that artist as the top/selected provider.
    if providers:
        prev_provider_id = state.chosen_provider_id
        # If we already have a chosen provider, prefer to keep it when it
        # still appears in the current provider list.
        chosen_idx = -1
        if prev_provider_id:
            for idx, p in enumerate(providers):
                try:
                    pid = int(p.get("artist_id") or 0)
                except Exception:
                    pid = 0
                if pid and pid == prev_provider_id:
                    chosen_idx = idx
                    break

        # When we are already awaiting confirmation or have created a booking,
        # we never change the chosen provider; we may still re-order the list
        # to show the chosen one first.
        if state.stage in ("awaiting_confirmation", "booking_created") and prev_provider_id:
            if chosen_idx > 0:
                providers[0], providers[chosen_idx] = providers[chosen_idx], providers[0]
        else:
            # Outside of the confirmation/created stages, prefer (in order):
            # 1) The artist the user explicitly asked for by name (if present),
            # 2) The previously chosen provider (if still present),
            # 3) The current top provider from the search results.
            requested_idx = -1
            if requested_artist_id:
                for idx, p in enumerate(providers):
                    try:
                        pid = int(p.get("artist_id") or 0)
                    except Exception:
                        pid = 0
                    if pid and pid == requested_artist_id:
                        requested_idx = idx
                        break

            if requested_idx >= 0:
                effective_idx = requested_idx
            elif chosen_idx >= 0:
                effective_idx = chosen_idx
            else:
                effective_idx = 0

            if effective_idx < 0 or effective_idx >= len(providers):
                effective_idx = 0

            if effective_idx > 0:
                providers[0], providers[effective_idx] = providers[effective_idx], providers[0]

            top = providers[0]
            name = top.get("name") or "this provider"
            try:
                new_id = int(top.get("artist_id") or 0) or None
            except Exception:
                new_id = None

            # If we switch providers, reset service selection and any
            # previous availability result so checks and messages are
            # recomputed for the new artist.
            if new_id != prev_provider_id:
                state.service_id = None
                state.service_name = None
                state.availability_checked = False
                state.availability_status = None
                state.availability_message_emitted = False

            state.chosen_provider_id = new_id
            state.chosen_provider_name = name
            if state.stage == "collecting_requirements":
                state.stage = "suggesting_providers"

    # When we know which provider we're talking about, try to pick a
    # representative service for quote previews so the UI and assistant can
    # talk about “from R…” in a way that includes travel/sound. Skip this on
    # the very first user turn to keep latency low.
    if not is_first_user_turn and state.chosen_provider_id and not state.service_id:
        sid, sname, _price = tool_pick_primary_service(db, int(state.chosen_provider_id))
        if sid:
            state.service_id = sid
            state.service_name = sname

    # Explain travel vs local trade-off once, when the artist's home city
    # differs from the event city. This helps users understand that artists
    # can travel and that travel costs will simply be included in the quote.
    event_city: Optional[str] = state.city or filters.get("location")
    provider_city: Optional[str] = None
    if providers:
        top = providers[0]
        provider_city_raw = top.get("location")
        if isinstance(provider_city_raw, str):
            provider_city = provider_city_raw.strip() or None

    # Compute a quote preview when we have enough structured information and
    # cache it inside the state so we only recompute previews when relevant
    # inputs change (service, city, guests, venue/sound context). To avoid
    # heavy quote calculations too early, only attempt a preview once we know
    # service, city, guest count, venue_type, and whether sound is needed.
    quote_ready = bool(
        not is_first_user_turn
        and state.service_id
        and state.city
        and state.guests is not None
        and state.venue_type
        and state.sound is not None
    )
    quote_sig: Optional[str] = None
    if quote_ready:
        quote_sig = json.dumps(
            {
                "service_id": int(state.service_id),
                "city": state.city,
                "date": state.date,
                "guests": state.guests,
                "venue_type": state.venue_type,
                "stage_required": state.stage_required,
                "stage_size": state.stage_size,
                "lighting_evening": state.lighting_evening,
                "lighting_upgrade_advanced": state.lighting_upgrade_advanced,
                "backline_required": state.backline_required,
                "sound_supplier_service_id": state.sound_supplier_service_id,
            },
            sort_keys=True,
            default=str,
        )

    if quote_ready and quote_sig:
        total_preview: Optional[float] = None
        if (
            state.quote_signature
            and state.quote_signature == quote_sig
            and state.quote_total_preview is not None
        ):
            total_preview = state.quote_total_preview
        else:
            total_preview = tool_quote_preview(db, state)
            state.quote_signature = quote_sig
            state.quote_total_preview = total_preview

        if total_preview is not None and providers:
            try:
                providers[0]["client_total_preview"] = total_preview
            except Exception:
                pass

    tool_calls: List[AgentToolCall] = []
    final_action: Optional[Dict[str, Any]] = None

    # Optionally check availability once we know provider + date and haven't
    # checked yet.
    if (
        state.chosen_provider_id
        and state.date
        and not state.availability_checked
        and not is_first_user_turn
    ):
        status = tool_check_availability(
            db=db,
            artist_id=int(state.chosen_provider_id),
            when_str=state.date,
        )
        state.availability_checked = True
        state.availability_status = status
        tool_calls.append(
            AgentToolCall(
                name="check_availability",
                args={"artist_id": int(state.chosen_provider_id), "date": state.date},
            )
        )

    # Ask Gemini (if available) to craft a natural reply; otherwise fall back
    # to a deterministic message so the agent never stays silent. On the very
    # first user turn we deliberately skip Gemini to keep the interaction
    # snappy and return a lightweight, deterministic reply.
    if is_first_user_turn:
        if providers:
            # If the user clearly asked for a specific artist and we see them
            # in the results, talk about that artist explicitly.
            if requested_artist_id and requested_artist_name:
                line = (
                    f"I can see {requested_artist_name} on Booka for your request, along with a few similar artists. "
                    "Tell me the event date and roughly how many guests you expect, and I’ll help refine options."
                )
            else:
                top = providers[0]
                name = top.get("name") or "this provider"
                city = top.get("location") or ""
                line = (
                    f"I've found some artists on Booka that could work"
                    f"{f', including {name} in {city}' if city else f', including {name}'}. "
                    "Tell me the event date and roughly how many guests you expect so I can narrow things down."
                )
            messages_out = [line]
        else:
            # Tailor the first-turn prompt based on what we already know so we
            # don't ask for fields the user has clearly provided (e.g. event_type).
            known_bits: List[str] = []
            if state.event_type:
                known_bits.append(str(state.event_type))
            if state.city:
                known_bits.append(f"in {state.city}")
            if state.date:
                known_bits.append(f"on {state.date}")
            if state.guests is not None:
                known_bits.append(f"for about {state.guests} guests")
            missing_bits: List[str] = []
            if not state.city:
                missing_bits.append("the city")
            if not state.date:
                missing_bits.append("a rough date")
            if state.guests is None:
                missing_bits.append("guest count")

            if known_bits:
                prefix = "Got it"
                summary = ", ".join(known_bits)
                if missing_bits:
                    ask = ", ".join(missing_bits[:-1]) + (" and " + missing_bits[-1] if len(missing_bits) > 1 else missing_bits[0])
                    line = (
                        f"{prefix} {summary}. Tell me {ask}, and I’ll suggest some artists on Booka that could fit."
                    )
                else:
                    line = (
                        f"{prefix} {summary}. I can now suggest some artists on Booka that could fit."
                    )
            else:
                line = (
                    "Tell me the event type, city, rough date, and guest count, and I’ll suggest some artists on Booka that could fit."
                )
            messages_out = [line]
    else:
        messages_out = _call_gemini_reply(
            messages,
            state,
            providers,
            filters,
            requested_artist_name=requested_artist_name,
            requested_artist_found=bool(requested_artist_id),
        ) or []
        if not messages_out:
            if providers:
                top = providers[0]
                name = top.get("name") or "this provider"
                city = top.get("location") or ""
                count = len(providers)
                if count == 1:
                    messages_out = [
                        f"I found 1 provider on Booka that fits: {name}{f' ({city})' if city else ''}."
                    ]
                else:
                    messages_out = [
                        f"I found {count} providers on Booka. Top match: {name}{f' ({city})' if city else ''}."
                    ]
            else:
                messages_out = [
                    "I couldn't find any providers on Booka that match that yet. "
                    "You can tell me more about the event type, city, and date so I can refine the search."
                ]

        # If the user is explicitly asking to see musicians/providers and
        # Gemini replied without mentioning any concrete suggestions, append a
        # deterministic summary so the chat always feels responsive.
        if messages_out and providers:
            try:
                last_reply = (messages_out[-1] or "").lower()
                ask_for_providers = False
                if last_user_text:
                    ask_for_providers = any(
                        phrase in last_user_text
                        for phrase in [
                            "where are the musicians",
                            "where are the artists",
                            "where are the djs",
                            "where are the bands",
                            "where are the providers",
                            "show me musicians",
                            "show me artists",
                            "show me options",
                            "show me providers",
                            "now let's look",
                            "now lets look",
                            "can i see the musicians",
                            "can i see the artists",
                            "show the musicians",
                            "show the artists",
                        ]
                    )
                mentions_provider_name = False
                top = providers[0]
                top_name_raw = top.get("name") or ""
                if top_name_raw:
                    top_name = str(top_name_raw).strip().lower()
                    if top_name and top_name in last_reply:
                        mentions_provider_name = True
                if ask_for_providers and not mentions_provider_name:
                    name = top.get("name") or "this provider"
                    city = top.get("location") or ""
                    count = len(providers)
                    if count == 1:
                        line = f"I found 1 provider on Booka that fits: {name}{f' ({city})' if city else ''}."
                    else:
                        line = f"I found {count} providers on Booka. Top match: {name}{f' ({city})' if city else ''}."
                    messages_out.append(line)
            except Exception:
                # Provider presentation must never break the agent.
                pass

    # Optionally append a concise summary line, but keep the user-facing chat
    # to a single assistant message per turn. When we have enough core fields,
    # we fold the summary into the end of the main message instead of sending
    # a separate bubble.
    if not state.summary_emitted and messages_out:
        summary_parts: List[str] = []
        core_count = 0
        if state.event_type:
            summary_parts.append(state.event_type)
            core_count += 1
        if state.city:
            summary_parts.append(f"in {state.city}")
            core_count += 1
        if state.date:
            summary_parts.append(f"on {state.date}")
            core_count += 1
        if state.guests is not None:
            summary_parts.append(f"for about {state.guests} guests")
            core_count += 1
        if state.venue_type:
            summary_parts.append(f"({state.venue_type} venue)")
        # Sound / production summary
        if state.sound == "yes":
            sound_bits: List[str] = ["needs sound"]
            if state.stage_required:
                sound_bits.append("stage")
            if state.lighting_evening:
                sound_bits.append("basic lighting")
            if state.backline_required:
                sound_bits.append("backline")
            summary_parts.append("with " + ", ".join(sound_bits))

        if core_count >= 2 and summary_parts:
            summary = "So far I have: " + ", ".join(summary_parts) + "."
            # Append the summary to the last assistant message so the UI only
            # renders a single bubble per turn.
            last = messages_out[-1].rstrip()
            messages_out[-1] = f"{last} {summary}" if last else summary
            state.summary_emitted = True

    # Explain the travel vs local trade-off once, after the main assistant
    # reply and summary, when the artist's home city differs from the event
    # city. This keeps the behaviour explicit and consistent for users.
    if (
        not state.travel_tradeoff_explained
        and state.chosen_provider_id
        and event_city
        and provider_city
    ):
        ev = event_city.strip()
        home = provider_city.strip()
        ev_l = ev.lower()
        home_l = home.lower()
        # Treat simple substring matches as "same-ish" city, e.g.
        # "Pretoria" vs "Pretoria, South Africa".
        different_city = ev_l not in home_l and home_l not in ev_l
        if different_city:
            provider_name = state.chosen_provider_name or (providers[0].get("name") if providers else "the artist")
            line = (
                f"{provider_name} is based in {home}, and your event is in {ev}. "
                "We can go ahead with them and include travel in the quote, or look at artists closer to your event if you prefer."
            )
            messages_out.append(line)
            state.travel_tradeoff_explained = True

    # Heuristic booking confirmation flow: require two explicit confirmations
    # before creating a booking:
    # 1) User accepts the summary/offer -> move to awaiting_final_confirmation.
    # 2) User confirms again after seeing the cost summary -> create booking.
    effective_city = state.city or filters.get("location")
    last_user_text = (user_messages[-1]["content"] or "").strip().lower() if user_messages else ""
    if last_user_text:
        positive = re.search(r"\b(yes|yep|yeah|book|confirm|go ahead|sounds good)\b", last_user_text)
        negative = re.search(r"\b(no|not|don't|do not|cancel|change)\b", last_user_text)
    else:
        positive = negative = None

    if negative:
        # User declined; drop back to suggesting/providers stage unless a
        # booking was already created.
        if state.stage != "booking_created":
            state.stage = "suggesting_providers"
    elif positive and _has_required_booking_fields(state) and state.chosen_provider_id and state.date and effective_city:
        if state.stage == "awaiting_confirmation" and (
            not state.availability_checked
            or state.availability_status != "unavailable"
        ):
            # First confirmation: summarise the event and rough cost before
            # actually creating a booking.
            provider_name = state.chosen_provider_name or "the artist"
            city = state.city or effective_city or ""
            etype = state.event_type or "event"
            guests = state.guests
            total_preview = state.quote_total_preview
            summary_parts = [
                f"your {etype}",
                f"in {city}" if city else "",
                f"on {state.date}",
                f"for about {guests} guests" if guests is not None else "",
            ]
            summary_parts = [p for p in summary_parts if p]
            summary = " ".join(summary_parts) if summary_parts else f"your event on {state.date}"

            if total_preview is not None:
                try:
                    approx = int(round(float(total_preview)))
                    line = (
                        f"Based on {summary}, bookings with {provider_name} usually come to around R{approx} "
                        "including Booka fees and VAT; the final quote can still change slightly with travel and sound. "
                        "If you're happy with that, should I go ahead and send the booking request on Booka now?"
                    )
                except Exception:
                    line = (
                        f"Based on {summary}, I can approximate the total cost for {provider_name}, "
                        "but the final quote will still depend on travel and sound. "
                        "If you're happy with this plan, should I go ahead and send the booking request on Booka now?"
                    )
            else:
                line = (
                    f"Based on {summary}, I don't have a full total yet for {provider_name}, "
                    "but their performance fee on Booka will be combined with travel and sound in the quote. "
                    "If you're happy with this plan, should I go ahead and send the booking request on Booka now?"
                )
            messages_out.append(line)
            state.stage = "awaiting_final_confirmation"
        elif state.stage == "awaiting_final_confirmation" and (
            not state.availability_checked
            or state.availability_status != "unavailable"
        ):
            # Second confirmation: actually create the booking request.
            user_texts = [
                (m.get("content") or "").strip()
                for m in messages
                if m.get("role") == "user" and (m.get("content") or "").strip()
            ]
            combined_message = "\n".join(user_texts) or "Booking request created via the Booka AI assistant."
            booking_id = tool_create_booking_request(
                db=db,
                current_user=current_user,
                state=state,
                message=combined_message,
            )
            if booking_id:
                final_action = {
                    "type": "booking_created",
                    "booking_request_id": booking_id,
                    "url": f"/booking-requests/{booking_id}",
                }
                tool_calls.append(
                    AgentToolCall(
                        name="create_booking_request",
                        args={"booking_request_id": booking_id},
                    )
                )
                provider_name = state.chosen_provider_name or "the artist"
                city = effective_city or ""
                line = f"I've created a booking request with {provider_name} on {state.date}"
                if city:
                    line += f" in {city}"
                line += f". You can review it in your bookings inbox (reference #{booking_id})."
                messages_out.append(line)
                state.stage = "booking_created"

    # If we have enough information and we're not already awaiting confirmation
    # or finished, append a clear booking-offer line when the provider looks
    # available and move to the awaiting_confirmation stage. If we know the
    # provider is unavailable, steer the user toward changing the date or
    # artist instead of offering to book, and only emit the explicit
    # unavailability line once per provider/date combination.
    if (
        state.stage in ("collecting_requirements", "suggesting_providers")
        and state.chosen_provider_id
        and state.date
        and effective_city
    ):
        if state.availability_status == "unavailable":
            if not state.availability_message_emitted:
                provider_name = state.chosen_provider_name or "the artist"
                city = effective_city or ""
                line = f"It looks like {provider_name} is already booked on {state.date}"
                if city:
                    line += f" in {city}"
                line += ". I can help you try a different date or suggest similar artists if you’d like."
                messages_out.append(line)
                state.availability_message_emitted = True
        else:
            provider_name = state.chosen_provider_name or "the artist"
            city = effective_city or ""
            # Only append a booking-offer line when we haven't already moved
            # into the awaiting_confirmation stage in a previous turn.
            if state.stage != "awaiting_confirmation" and _has_required_booking_fields(state):
                line = f"If you'd like, I can create a booking request with {provider_name} on {state.date}"
                if city:
                    line += f" in {city}"
                line += " using what you've told me so far. Reply “Yes” to confirm or “No” to adjust anything first."
                messages_out.append(line)
                state.stage = "awaiting_confirmation"
    step_result = AgentStepResult(
        messages=messages_out,
        state=state,
        providers=providers,
        tool_calls=tool_calls,
        final_action=final_action,
    )

    # Lightweight structured logging so we can inspect how the agent behaves
    # in production without dumping full message contents.
    try:
        if getattr(settings, "FEATURE_AI_AGENT_LOGGING", False):
            log_payload = {
                "user_id": getattr(current_user, "id", None),
                "stage": state.stage,
                "chosen_provider_id": state.chosen_provider_id,
                "date": state.date,
                "city": state.city,
                "guests": state.guests,
                "venue_type": state.venue_type,
                "sound": state.sound,
                "availability_status": state.availability_status,
                "tool_calls": [tc.name for tc in tool_calls],
                "final_action": (final_action or {}).get("type") if final_action else None,
            }
            logger.info("booking_agent_step: %s", log_payload)
    except Exception:
        # Logging must never break the request.
        pass

    return step_result
