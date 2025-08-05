"""Schemas for natural language booking parsing."""

from datetime import date as date_type
from typing import Optional

from pydantic import BaseModel, Field


class BookingParseRequest(BaseModel):
    """Request body containing raw event description."""

    text: str = Field(..., min_length=1, description="Free-form event description")


class ParsedBookingDetails(BaseModel):
    """Structured details extracted from text."""

    date: Optional[date_type] = Field(None, description="Event date if detected")
    location: Optional[str] = Field(None, description="Event location if detected")
    guests: Optional[int] = Field(None, description="Guest count if detected")

    event_type: Optional[str] = Field(
        None, description="Event type if detected"
    )


    model_config = {"from_attributes": True}
