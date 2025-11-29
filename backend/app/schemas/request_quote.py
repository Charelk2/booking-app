from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal

from ..models.booking_status import BookingStatus
from .user import UserResponse  # For nesting user details
from .artist import ArtistProfileResponse  # Include artist business name
from .service import ServiceResponse  # For nesting service details

# --- BookingRequest Schemas ---

class BookingRequestBase(BaseModel):
    service_id: Optional[int] = None
    message: Optional[str] = None
    attachment_url: Optional[str] = None
    proposed_datetime_1: Optional[datetime] = None
    proposed_datetime_2: Optional[datetime] = None
    travel_mode: Optional[str] = None
    travel_cost: Optional[Decimal] = None
    travel_breakdown: Optional[dict] = None
    # Optional link to a parent booking request so artist + supplier threads
    # can be grouped for the same underlying event.
    parent_booking_request_id: Optional[int] = None

class BookingRequestCreate(BookingRequestBase):
    artist_id: int # Client must specify the artist they are requesting
    status: Optional[BookingStatus] = BookingStatus.PENDING_QUOTE

class BookingRequestUpdateByClient(BaseModel): # Client can withdraw or update message/times
    service_id: Optional[int] = None
    message: Optional[str] = None
    attachment_url: Optional[str] = None
    proposed_datetime_1: Optional[datetime] = None
    proposed_datetime_2: Optional[datetime] = None
    travel_mode: Optional[str] = None
    travel_cost: Optional[Decimal] = None
    travel_breakdown: Optional[dict] = None
    status: Optional[BookingStatus] = None # e.g. REQUEST_WITHDRAWN

class BookingRequestUpdateByArtist(BaseModel): # Artist can decline
    status: Optional[BookingStatus] = None # e.g. REQUEST_DECLINED

class BookingRequestResponse(BookingRequestBase):
    id: int
    client_id: int
    artist_id: int
    parent_booking_request_id: Optional[int] = None
    status: BookingStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    travel_mode: Optional[str] = None
    travel_cost: Optional[Decimal] = None
    travel_breakdown: Optional[dict] = None
    
    client: Optional[UserResponse] = None
    artist: Optional[UserResponse] = None  # Original artist user details
    # Added artist_profile so responses include business name
    artist_profile: Optional[ArtistProfileResponse] = None
    # Alias for frontend compatibility: some clients expect
    # `service_provider_profile` on booking requests.
    service_provider_profile: Optional[ArtistProfileResponse] = None
    service: Optional[ServiceResponse] = None
    accepted_quote_id: Optional[int] = None
    last_message_content: Optional[str] = None
    last_message_timestamp: Optional[datetime] = None
    quotes: Optional[List[Any]] = None

    model_config = {
        "from_attributes": True
    }


class TravelEstimate(BaseModel):
    """Individual travel mode cost estimate."""

    mode: str
    cost: Decimal


class QuoteCalculationResponse(BaseModel):
    """Schema for detailed quote calculations used by the quick quote API."""

    base_fee: Decimal
    travel_cost: Decimal
    travel_mode: str
    travel_estimates: List[TravelEstimate]
    accommodation_cost: Decimal
    sound_cost: Decimal
    sound_mode: str
    sound_mode_overridden: bool = False
    sound_provider_id: Optional[int] = None
    total: Decimal


class QuoteCalculationParams(BaseModel):
    """Schema for the /quotes/calculate request body."""

    base_fee: Decimal
    distance_km: Optional[float] = None
    service_id: int
    event_city: str
    accommodation_cost: Optional[Decimal] = None
    # Optional sound-context inputs to allow contextual sound estimates server-side
    guest_count: Optional[int] = None
    venue_type: Optional[str] = None  # indoor | outdoor | hybrid
    stage_required: Optional[bool] = None
    stage_size: Optional[str] = None  # S | M | L
    lighting_evening: Optional[bool] = None
    upgrade_lighting_advanced: Optional[bool] = None
    backline_required: Optional[bool] = None
    selected_sound_service_id: Optional[int] = None
    supplier_distance_km: Optional[float] = None
    # Optional rider/backline context to include per-unit extras and backline rentals
    class RiderUnits(BaseModel):
        vocal_mics: Optional[int] = 0
        speech_mics: Optional[int] = 0
        monitor_mixes: Optional[int] = 0
        iem_packs: Optional[int] = 0
        di_boxes: Optional[int] = 0

    rider_units: Optional[RiderUnits] = None
    backline_requested: Optional[Dict[str, int]] = None
