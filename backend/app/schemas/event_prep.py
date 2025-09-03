from pydantic import BaseModel, Field
from typing import Optional


class EventPrepBase(BaseModel):
    day_of_contact_name: Optional[str] = None
    day_of_contact_phone: Optional[str] = None
    venue_address: Optional[str] = None
    venue_place_id: Optional[str] = None
    venue_lat: Optional[float] = None
    venue_lng: Optional[float] = None
    loadin_start: Optional[str] = Field(None, description="HH:MM[:SS]")
    loadin_end: Optional[str] = Field(None, description="HH:MM[:SS]")
    soundcheck_time: Optional[str] = Field(None, description="HH:MM[:SS]")
    guests_arrival_time: Optional[str] = Field(None, description="HH:MM[:SS]")
    performance_start_time: Optional[str] = Field(None, description="HH:MM[:SS]")
    performance_end_time: Optional[str] = Field(None, description="HH:MM[:SS]")
    tech_owner: Optional[str] = Field(None, description="'venue' | 'artist'")
    stage_power_confirmed: Optional[bool] = None
    accommodation_required: Optional[bool] = None
    accommodation_address: Optional[str] = None
    accommodation_contact: Optional[str] = None
    accommodation_notes: Optional[str] = None
    # General notes shown in the Notes & attachments section
    notes: Optional[str] = None
    # Separate notes shown under the Schedule section
    schedule_notes: Optional[str] = None
    # Separate notes for parking and venue access logistics (Location section)
    parking_access_notes: Optional[str] = None

    # Booking Wizard fields persisted for clarity in Event Prep
    event_type: Optional[str] = None
    guests_count: Optional[int] = None


class EventPrepResponse(EventPrepBase):
    booking_id: int
    progress_done: int
    progress_total: int

    model_config = {"from_attributes": True}


class EventPrepPatch(EventPrepBase):
    pass
