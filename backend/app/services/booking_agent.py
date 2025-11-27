import logging
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models import User as DbUser
from app.schemas.booking_agent import BookingAgentState
from app.services.ai_search import ai_provider_search

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


def run_booking_agent_step(
    db: Session,
    current_user: DbUser,
    messages: List[Dict[str, str]],
    state: Optional[BookingAgentState] = None,
) -> AgentStepResult:
    """Very first, heuristic-only agent step.

    This is a placeholder implementation that keeps behavior predictable while
    we wire the frontend and API. In a later iteration, this function will be
    replaced with a Gemini-powered tool-using agent that can reason over the
    full conversation.
    """
    state = state or BookingAgentState()
    # Extract the latest user message as the primary query signal.
    user_messages = [m for m in messages if m.get("role") == "user"]
    query_text = (user_messages[-1]["content"] or "").strip() if user_messages else ""

    providers, filters = tool_search_providers(db, query_text, state)
    messages_out: List[str] = []

    if providers:
        top = providers[0]
        name = top.get("name") or "this provider"
        city = top.get("location") or ""
        count = len(providers)
        if count == 1:
            messages_out.append(f"I found 1 provider on Booka that fits: {name}{f' ({city})' if city else ''}.")
        else:
            messages_out.append(
                f"I found {count} providers on Booka. Top match: {name}{f' ({city})' if city else ''}."
            )
        # Update chosen provider in state heuristically.
        try:
            state.chosen_provider_id = int(top.get("artist_id") or 0) or None
        except Exception:
            state.chosen_provider_id = None
        state.chosen_provider_name = name
    else:
        messages_out.append("I couldn't find any providers on Booka that match that yet.")

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

    # For now, return a no-tool, no-final-action result; the HTTP layer can
    # still surface provider cards to the client. Gemini integration and
    # richer follow-ups will be layered on top of this.
    return AgentStepResult(
        messages=messages_out,
        state=state,
        providers=providers,
        tool_calls=[],
        final_action=None,
    )

