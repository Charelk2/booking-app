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

    availability_checked: bool = Field(
        default=False,
        description="Whether availability has been checked for chosen_provider_id on the selected date.",
    )
    availability_status: Optional[Literal["available", "unavailable", "unknown"]] = Field(
        default=None,
        description="Result of the last availability check for the chosen provider/date.",
    )

