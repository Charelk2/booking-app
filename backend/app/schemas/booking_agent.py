from __future__ import annotations

from typing import Optional, Literal

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

    availability_checked: bool = Field(
        default=False,
        description="Whether availability has been checked for chosen_provider_id on the selected date.",
    )
    availability_status: Optional[Literal["available", "unavailable", "unknown"]] = Field(
        default=None,
        description="Result of the last availability check for the chosen provider/date.",
    )
