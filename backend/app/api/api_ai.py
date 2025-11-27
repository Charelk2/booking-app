from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Literal

from app.core.config import settings
from app.database import get_db
from sqlalchemy.orm import Session
from app.services.ai_search import ai_provider_search
from app.services.booking_agent import run_booking_agent_step
from app.schemas.booking_agent import BookingAgentState
from .dependencies import get_current_active_client


router = APIRouter()


class AiProviderSearchRequest(BaseModel):
    query: str = Field(..., description="Free-form description of the event / needs.")
    category: Optional[str] = Field(
        None, description="Optional service category slug, e.g. 'dj', 'musician'."
    )
    location: Optional[str] = Field(
        None, description="Optional location hint, e.g. 'Cape Town'."
    )
    when: Optional[str] = Field(
        None, description="Optional event date in YYYY-MM-DD format."
    )
    min_price: Optional[float] = Field(
        None, description="Minimum budget in ZAR."
    )
    max_price: Optional[float] = Field(
        None, description="Maximum budget in ZAR."
    )
    limit: Optional[int] = Field(
        6, description="Maximum number of suggestions to return."
    )


class AiProviderOut(BaseModel):
    artist_id: int
    slug: str
    name: str
    location: str
    categories: Optional[List[str]] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    starting_price: Optional[float] = None
    client_total_preview: Optional[float] = None
    profile_url: str
    avatar_url: Optional[str] = None
    relevance_score: Optional[float] = None


class AiProviderFilters(BaseModel):
    category: Optional[str] = None
    location: Optional[str] = None
    when: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None


class AiProviderSearchResponse(BaseModel):
    providers: List[AiProviderOut]
    filters: AiProviderFilters
    explanation: str
    source: Optional[str] = None


class AiChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AiAssistantRequest(BaseModel):
    messages: List[AiChatMessage] = Field(
        ..., description="Conversation so far (user and assistant messages)."
    )
    category: Optional[str] = Field(
        None, description="Optional service category slug, e.g. 'dj', 'musician'."
    )
    location: Optional[str] = Field(
        None, description="Optional location hint, e.g. 'Cape Town'."
    )
    when: Optional[str] = Field(
        None, description="Optional event date in YYYY-MM-DD format."
    )
    min_price: Optional[float] = Field(
        None, description="Minimum budget in ZAR."
    )
    max_price: Optional[float] = Field(
        None, description="Maximum budget in ZAR."
    )
    limit: Optional[int] = Field(
        6, description="Maximum number of suggestions to return."
    )


class AiAssistantResponse(BaseModel):
    messages: List[AiChatMessage]
    providers: List[AiProviderOut]
    filters: AiProviderFilters
    source: Optional[str] = None


class BookingAgentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class BookingAgentStateIn(BookingAgentState):
    """Alias for client-facing booking agent state."""

    pass


class BookingAgentRequest(BaseModel):
    messages: List[BookingAgentMessage] = Field(
        ..., description="Conversation so far (user and assistant messages)."
    )
    state: Optional[BookingAgentStateIn] = Field(
        default=None,
        description="Current booking wizard-like state for the agent; omitted on first turn.",
    )


class BookingAgentAction(BaseModel):
    type: Literal["booking_created"]
    booking_request_id: int
    url: str


class BookingAgentResponse(BaseModel):
    messages: List[BookingAgentMessage]
    state: BookingAgentStateIn
    providers: List[AiProviderOut] = []
    actions: List[BookingAgentAction] = []


@router.post(
    "/ai/providers/search",
    response_model=AiProviderSearchResponse,
    response_model_exclude_none=True,
    summary="AI-assisted provider search for Booka frontends",
)
def ai_providers_search(
    payload: AiProviderSearchRequest,
    db: Session = Depends(get_db),
):
    """AI-assisted provider search.

    This endpoint interprets a natural language *query* in combination with
    optional structured filters (category, location, date, budget) and returns
    a small list of suggested providers along with the interpreted filters.

    Behavior is gated behind the FEATURE_AI_SEARCH flag. When disabled, the
    endpoint returns HTTP 503 with a machine-readable detail.
    """
    if not getattr(settings, "FEATURE_AI_SEARCH", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ai_search_disabled",
        )

    try:
        result = ai_provider_search(db, payload.model_dump())
    except ValueError as exc:
        if str(exc) == "query_required":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"query": "required"},
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ai_search_invalid",
        )
    except RuntimeError as exc:
        if str(exc) == "ai_search_disabled":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="ai_search_disabled",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ai_search_error",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ai_search_error",
        )

    return result


@router.post(
    "/ai/assistant",
    response_model=AiAssistantResponse,
    response_model_exclude_none=True,
    summary="AI conversational assistant for provider discovery and booking prep",
)
def ai_assistant(
    payload: AiAssistantRequest,
    db: Session = Depends(get_db),
):
    """Conversational AI assistant for Booka.

    This endpoint is designed for a simple inline chat UI. It treats the latest
    user message as the primary query, applies optional structured filters
    (category, location, date, budget), and then delegates to the same
    ai_provider_search helper used by the one-shot search endpoint.

    The response echoes back the full message history plus a new assistant
    message that explains how the suggestions were chosen. Frontends are free
    to render the providers and messages however they like.
    """
    if not getattr(settings, "FEATURE_AI_SEARCH", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ai_search_disabled",
        )

    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"messages": "at least one message is required"},
        )

    # Use recent user messages (not just the last one) as the query text so
    # names mentioned earlier (e.g. "Charel Kleinhans") stay in context when
    # the user follows up with pronouns like "book him on 19 Jan".
    user_messages = [m for m in payload.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"messages": "at least one user message is required"},
        )
    recent_texts = [
        (m.content or "").strip()
        for m in user_messages[-3:]
        if (m.content or "").strip()
    ]
    combined_query = " ".join(recent_texts).strip()
    if not combined_query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"query": "required"},
        )

    search_payload: Dict[str, Any] = {
        "query": combined_query,
        "category": payload.category,
        "location": payload.location,
        "when": payload.when,
        "min_price": payload.min_price,
        "max_price": payload.max_price,
        "limit": payload.limit,
    }

    try:
        result = ai_provider_search(db, search_payload)
    except ValueError as exc:
        if str(exc) == "query_required":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"query": "required"},
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ai_search_invalid",
        )
    except RuntimeError as exc:
        if str(exc) == "ai_search_disabled":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="ai_search_disabled",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ai_search_error",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ai_search_error",
        )

    assistant_message = AiChatMessage(
        role="assistant",
        content=result.get(
            "explanation",
            "Here are some providers on Booka that match what you described.",
        ),
    )
    messages_out = payload.messages + [assistant_message]

    providers = [
        AiProviderOut(**p) for p in result.get("providers", [])
    ]
    filters = AiProviderFilters(**result.get("filters", {}))

    return AiAssistantResponse(
        messages=messages_out,
        providers=providers,
        filters=filters,
        source=result.get("source"),
    )


@router.post(
    "/ai/booking-agent",
    response_model=BookingAgentResponse,
    response_model_exclude_none=True,
    summary="AI booking agent for conversational booking requests",
)
def booking_agent(
    payload: BookingAgentRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_client),
):
    """Stateful booking agent endpoint.

    This endpoint is designed for an inline chat UI that wants to behave like a
    conversational Booking Wizard. The frontend passes the full conversation
    and the current BookingAgentState; the agent responds with new assistant
    messages, an updated state, and optional side-effect actions such as
    'booking_created'.

    For now this uses a heuristic-only implementation in
    `run_booking_agent_step`; a future iteration can swap in a Gemini-powered
    tool-using agent without changing this contract.
    """
    if not getattr(settings, "FEATURE_AI_SEARCH", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ai_search_disabled",
        )

    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"messages": "at least one message is required"},
        )

    # Coerce messages into the simple dict form expected by the agent service.
    msg_dicts: List[Dict[str, str]] = [
        {"role": m.role, "content": m.content} for m in payload.messages
    ]
    state_in = payload.state or BookingAgentState()

    try:
        step = run_booking_agent_step(
            db=db,
            current_user=current_user,
            messages=msg_dicts,
            state=state_in,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ai_agent_error",
        )

    # Map agent result back to API models.
    assistant_messages = [
        BookingAgentMessage(role="assistant", content=m) for m in step.messages
    ]
    messages_out = payload.messages + assistant_messages

    # step.state is a BookingAgentState instance; normalise via model_dump so
    # Pydantic v2 gets a plain dict for validation.
    state_out = BookingAgentStateIn.model_validate(step.state.model_dump())
    providers = [AiProviderOut(**p) for p in step.providers or []]

    actions: List[BookingAgentAction] = []
    if step.final_action and step.final_action.get("type") == "booking_created":
        try:
            br_id = int(step.final_action.get("booking_request_id") or 0)
            url = step.final_action.get("url") or f"/booking-requests/{br_id}"
            if br_id > 0:
                actions.append(
                    BookingAgentAction(
                        type="booking_created",
                        booking_request_id=br_id,
                        url=url,
                    )
                )
        except Exception:
            # Ignore malformed final_action; agent remains best-effort.
            pass

    return BookingAgentResponse(
        messages=messages_out,
        state=state_out,
        providers=providers,
        actions=actions,
    )
