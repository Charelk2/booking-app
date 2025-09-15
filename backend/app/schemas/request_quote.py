from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

from ..models.booking_status import BookingStatus
from ..models.request_quote import QuoteStatus # Enums from models
from .user import UserResponse  # For nesting user details
from .artist import ArtistProfileResponse  # Include artist business name
from .service import ServiceResponse  # For nesting service details
# from .booking import BookingResponse # For nesting booking if created from quote

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
    service: Optional[ServiceResponse] = None
    quotes: List['QuoteResponse'] = []
    accepted_quote_id: Optional[int] = None
    last_message_content: Optional[str] = None
    last_message_timestamp: Optional[datetime] = None

    model_config = {
        "from_attributes": True
    }

# --- Quote Schemas ---

class QuoteBase(BaseModel):
    quote_details: str
    price: Decimal
    currency: str = "ZAR"
    valid_until: Optional[datetime] = None

class QuoteCreate(QuoteBase):
    booking_request_id: int # Artist creates a quote for a specific request

class QuoteUpdateByArtist(BaseModel): # Artist can update details or withdraw quote
    quote_details: Optional[str] = None
    price: Optional[Decimal] = Field(default=None)
    currency: Optional[str] = None
    valid_until: Optional[datetime] = None
    status: Optional[QuoteStatus] = None # e.g. WITHDRAWN_BY_ARTIST

class QuoteUpdateByClient(BaseModel): # Client can accept or reject
    status: QuoteStatus # e.g. ACCEPTED_BY_CLIENT, REJECTED_BY_CLIENT

class QuoteResponse(QuoteBase):
    id: int
    booking_request_id: int
    artist_id: int # Artist who created the quote
    status: QuoteStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    artist: Optional[UserResponse] = None  # Artist user details
    # Include service provider profile so quotes also expose the business name
    artist_profile: Optional[ArtistProfileResponse] = None
    # Exclude booking_request to avoid recursion when nested under
    # BookingRequestResponse -> QuoteResponse -> BookingRequestResponse
    booking_request: Optional[BookingRequestResponse] = Field(
        default=None, exclude=True
    )
    # booking: Optional[BookingResponse] = None # Optional: If a booking was created from this quote

    model_config = {
        "from_attributes": True
    }

# Update BookingRequestResponse to include quotes after QuoteResponse is defined
BookingRequestResponse.model_rebuild()


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
    distance_km: float
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
