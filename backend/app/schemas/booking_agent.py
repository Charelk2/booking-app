from __future__ import annotations

from typing import Optional, Literal, List

from pydantic import BaseModel, Field


class BookingAgentState(BaseModel):
    """Lightweight, serializable state for the conversational booking agent.

    This captures the key fields the Booking Wizard needs so the agent can
    progressively fill them in over multiple turns and eventually create a
    booking request on the user's behalf.
    """

    chosen_provider_id: Optional[int] = Field(
        default=None, description="Selected provider's user_id when locked in."
    )
    chosen_provider_name: Optional[str] = Field(
        default=None, description="Display name of the selected provider."
    )
    service_id: Optional[int] = Field(
        default=None,
        description="Selected service ID for quoting/pricing when known.",
    )
    service_name: Optional[str] = Field(
        default=None,
        description="Human-friendly name of the selected service (e.g. 'Acoustic Duo Package').",
    )

    event_type: Optional[str] = Field(
        default=None,
        description="High-level event type such as 'wedding', 'birthday', 'corporate'.",
    )
    city: Optional[str] = Field(
        default=None,
        description="Town or city where the event will take place.",
    )
    date: Optional[str] = Field(
        default=None,
        description="Event date in YYYY-MM-DD format.",
    )
    time: Optional[str] = Field(
        default=None,
        description="Event time or time-of-day label (e.g., '18:00', 'evening').",
    )

    guests: Optional[int] = Field(
        default=None,
        description="Approximate number of guests attending the event.",
    )
    venue_type: Optional[str] = Field(
        default=None,
        description="Venue type such as 'indoor', 'outdoor', or 'hybrid'.",
    )
    budget_min: Optional[float] = Field(
        default=None,
        description="Lower bound of the client's budget in ZAR, if provided.",
    )
    budget_max: Optional[float] = Field(
        default=None,
        description="Upper bound of the client's budget in ZAR, if provided.",
    )

    notes: Optional[str] = Field(
        default=None,
        description="Free-form summary of the client's requirements accumulated from the chat.",
    )

    service_category: Optional[str] = Field(
        default=None,
        description=(
            "High-level service category the user is currently interested in, "
            "such as 'musician', 'photographer', or 'sound_service'."
        ),
    )

    # Sound / production context (mirrors key fields from the Booking Wizard)
    sound: Optional[str] = Field(
        default=None,
        description="Whether the client needs sound equipment: 'yes' or 'no'.",
    )
    sound_mode: Optional[str] = Field(
        default=None,
        description=(
            "How sound will be handled when sound is needed, e.g. "
            "'supplier', 'provided_by_artist', 'managed_by_artist', 'client_provided', or 'none'."
        ),
    )
    sound_supplier_service_id: Optional[int] = Field(
        default=None,
        description="Optional service ID of a preferred sound supplier on Booka.",
    )
    stage_required: Optional[bool] = Field(
        default=None,
        description="Whether a stage is required at the venue.",
    )
    stage_size: Optional[str] = Field(
        default=None,
        description="Preferred stage size when required, e.g. 'S', 'M', or 'L'.",
    )
    lighting_evening: Optional[bool] = Field(
        default=None,
        description="Whether evening lighting is needed for the event.",
    )
    lighting_upgrade_advanced: Optional[bool] = Field(
        default=None,
        description="Whether to upgrade to advanced lighting when available.",
    )
    backline_required: Optional[bool] = Field(
        default=None,
        description="Whether musical backline (drums, amps, etc.) is required.",
    )
    sound_notes: Optional[str] = Field(
        default=None,
        description="Extra sound/production notes that don't fit into structured fields.",
    )

    quote_signature: Optional[str] = Field(
        default=None,
        description="Internal cache key for the last quote preview.",
    )
    quote_total_preview: Optional[float] = Field(
        default=None,
        description="Cached client_total_incl_vat from the last quote preview.",
    )

    stage: Optional[Literal["collecting_requirements", "suggesting_providers", "awaiting_confirmation", "awaiting_final_confirmation", "booking_created"]] = Field(
        default="collecting_requirements",
        description=(
            "High-level conversation stage for the agent; used to gate actions "
            "like booking creation so they only occur after explicit confirmation."
        ),
    )

    availability_checked: bool = Field(
        default=False,
        description="Whether availability has been checked for chosen_provider_id on the selected date.",
    )
    availability_status: Optional[Literal["available", "unavailable", "unknown"]] = Field(
        default=None,
        description="Result of the last availability check for the chosen provider/date.",
    )
    availability_message_emitted: bool = Field(
        default=False,
        description=(
            "Whether the agent has already sent an explicit 'artist is unavailable on this date' "
            "message for the current provider/date combination."
        ),
    )

    summary_emitted: bool = Field(
        default=False,
        description=(
            "Whether the agent has already sent a consolidated \"here's what I have so far\" "
            "summary message in this conversation."
        ),
    )

    intent: Optional[Literal["find_provider", "book_named_provider", "general_question", "modify_brief"]] = Field(
        default=None,
        description=(
            "High-level intent for the current conversation turn. Used to distinguish between "
            "provider search, booking a specific artist, general Booka questions, and brief changes."
        ),
    )

    asked_fields: List[str] = Field(
        default_factory=list,
        description=(
            "List of booking state fields the agent has already asked follow-up questions about "
            "(e.g. 'date', 'city', 'budget'). Used to avoid repeating the same questions."
        ),
    )
    answered_fields: List[str] = Field(
        default_factory=list,
        description=(
            "List of booking state fields that have been filled in by the user at least once. "
            "Helps the agent avoid asking about fields that already have values."
        ),
    )

    travel_tradeoff_explained: bool = Field(
        default=False,
        description=(
            "Whether the agent has already explained that the chosen artist is based in a "
            "different city to the event and offered the option of sticking with them (with travel) "
            "versus switching to someone closer."
        ),
    )

    providers_shown: bool = Field(
        default=False,
        description=(
            "Whether the agent has already presented a concrete list/summary of provider suggestions "
            "for the current lane so it does not keep repeating the same 'I found X providers' line."
        ),
    )
