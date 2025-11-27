import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models import User as DbUser
from app.schemas.booking_agent import BookingAgentState
from app.services.ai_search import ai_provider_search
from app.core.config import settings

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


def _build_search_payload_from_state(
    query_text: str, state: BookingAgentState, limit: int = 6
) -> Dict[str, Any]:
    """Coerce conversation state into a payload for `ai_provider_search`."""
    # Use existing state as soft filters; the model can still override if needed.
    category = None  # we can map event_type->category later if useful
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


def tool_search_providers(
    db: Session, query_text: str, state: BookingAgentState, limit: int = 6
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Wrapper around ai_provider_search for use by the booking agent.

    Returns a tuple of (providers, filters_dict).
    """
    payload = _build_search_payload_from_state(query_text, state, limit=limit)
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
    except Exception as exc:  # pragma: no cover
        logger.error("Agent booking_request imports failed: %s", exc)
        return None

    artist_id = int(state.chosen_provider_id)

    # Compose the BookingRequestCreate payload. The agent currently only sets
    # artist_id and message; future iterations can thread through a concrete
    # service_id or structured travel/sound context when those are known.
    req = BookingRequestCreate(
        artist_id=artist_id,
        message=message,
    )

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


def _call_gemini_reply(
    messages: List[Dict[str, str]],
    state: BookingAgentState,
    providers: List[Dict[str, Any]],
    filters: Dict[str, Any],
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

    try:
        from google import genai  # type: ignore
    except Exception:
        logger.warning("google-genai not available; booking agent falling back to heuristics")
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
        if client_total_preview is not None:
            try:
                parts.append(f"typical Booka bookings starting from about R{round(float(client_total_preview))} before travel and sound.")
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
        "city": state.city or filters.get("location"),
        "date": state.date or filters.get("when"),
        "guests": state.guests,
        "budget_min": state.budget_min,
        "budget_max": state.budget_max,
        "venue_type": state.venue_type,
        "sound_needed": state.sound,
        "sound_mode": state.sound_mode,
        "stage_required": state.stage_required,
        "stage_size": state.stage_size,
        "lighting_evening": state.lighting_evening,
        "backline_required": state.backline_required,
    }
    missing = [k for k, v in known_fields.items() if not v]

    system_instructions = (
        "You are Booka's booking assistant. You help users in South Africa find artists and create booking "
        "requests on Booka. You only reason about popularity and bookings ON Booka, never outside of it. "
        "You see the user's latest message, current booking state (event type, city, date, guests, budget), "
        "and a short summary of the top matching provider if any.\n\n"
        "Your job is to:\n"
        "- Acknowledge what the user asked in a friendly, concise way.\n"
        "- If a top provider is available, mention them, why they fit, and a rough starting price if provided (e.g. “from about R12 000 on Booka, before travel and sound”).\n"
        "- Ask at most 1–2 follow-up questions focusing on missing key details (date, city, budget, event type, guests, venue type, and sound/production needs like sound equipment, stage, and lighting).\n"
        "- Do NOT talk about tools or internal details; just sound like a human assistant.\n"
        "- Keep replies to 1–3 short sentences.\n"
    )

    context_lines: List[str] = []
    if top_summary:
        context_lines.append(f"Top provider: {top_summary}.")
    context_lines.append(f"Known state: {known_fields}.")
    if missing:
        context_lines.append(f"Missing fields: {', '.join(missing)}.")

    prompt = (
        f"{system_instructions}\n"
        f"Latest user message: {last_user or '(none)'}\n"
        f"{' '.join(context_lines)}\n\n"
        "Respond as the assistant with natural language only."
    )

    try:
        client = genai.Client(api_key=api_key)
        res = client.models.generate_content(model=model_name, contents=prompt)
        text = (getattr(res, "text", None) or "").strip()
        if not text:
            return None
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
    # Extract the latest user message as the primary query signal.
    user_messages = [m for m in messages if m.get("role") == "user"]
    query_text = (user_messages[-1]["content"] or "").strip() if user_messages else ""

    providers, filters = tool_search_providers(db, query_text, state)

    # Lightweight extraction of a few structured fields from the latest user
    # message so we can progressively fill the state (e.g. sound preference).
    try:
        t = (query_text or "").lower()
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
        state.city = state.city or filters.get("location") or None
        state.date = state.date or filters.get("when") or None
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

    # Keep a heuristic chosen provider to mirror current UX.
    if providers:
        top = providers[0]
        name = top.get("name") or "this provider"
        try:
            state.chosen_provider_id = int(top.get("artist_id") or 0) or None
        except Exception:
            state.chosen_provider_id = None
        state.chosen_provider_name = name

    tool_calls: List[AgentToolCall] = []
    final_action: Optional[Dict[str, Any]] = None

    # Optionally check availability once we know provider + date and haven't
    # checked yet.
    if (
        state.chosen_provider_id
        and state.date
        and not state.availability_checked
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
    # to a deterministic message so the agent never stays silent.
    messages_out = _call_gemini_reply(messages, state, providers, filters) or []
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

    # Heuristic "yes, book it" detection: if the latest user message clearly
    # affirms booking and we have the minimum required fields, create a booking
    # request on their behalf.
    if state.chosen_provider_id and state.date and (state.city or filters.get("location")):
        last_user_text = (user_messages[-1]["content"] or "").strip().lower() if user_messages else ""
        if last_user_text:
            positive = re.search(r"\b(yes|yep|yeah|book|confirm|go ahead|sounds good)\b", last_user_text)
            negative = re.search(r"\b(no|not|don't|do not|cancel|change)\b", last_user_text)
            if positive and not negative:
                # Build a concise summary message for the booking request from
                # all user messages in the thread.
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
                    # Append a clear confirmation line for the user.
                    provider_name = state.chosen_provider_name or "the artist"
                    city = state.city or filters.get("location") or ""
                    line = f"I've created a booking request with {provider_name} on {state.date}"
                    if city:
                        line += f" in {city}"
                    line += f". You can review it in your bookings inbox (reference #{booking_id})."
                    messages_out.append(line)
    return AgentStepResult(
        messages=messages_out,
        state=state,
        providers=providers,
        tool_calls=tool_calls,
        final_action=final_action,
    )
