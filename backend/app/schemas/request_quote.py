from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

from ..models.request_quote import BookingRequestStatus, QuoteStatus # Enums from models
from .user import UserResponse # For nesting user details
from .service import ServiceResponse # For nesting service details
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
    status: Optional[BookingRequestStatus] = BookingRequestStatus.PENDING_QUOTE

class BookingRequestUpdateByClient(BaseModel): # Client can withdraw or update message/times
    service_id: Optional[int] = None
    message: Optional[str] = None
    attachment_url: Optional[str] = None
    proposed_datetime_1: Optional[datetime] = None
    proposed_datetime_2: Optional[datetime] = None
    travel_mode: Optional[str] = None
    travel_cost: Optional[Decimal] = None
    travel_breakdown: Optional[dict] = None
    status: Optional[BookingRequestStatus] = None # e.g. REQUEST_WITHDRAWN

class BookingRequestUpdateByArtist(BaseModel): # Artist can decline
    status: Optional[BookingRequestStatus] = None # e.g. REQUEST_DECLINED

class BookingRequestResponse(BookingRequestBase):
    id: int
    client_id: int
    artist_id: int
    status: BookingRequestStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    travel_mode: Optional[str] = None
    travel_cost: Optional[Decimal] = None
    travel_breakdown: Optional[dict] = None
    
    client: Optional[UserResponse] = None
    artist: Optional[UserResponse] = None # Artist's UserResponse
    service: Optional[ServiceResponse] = None
    quotes: List['QuoteResponse'] = []
    accepted_quote_id: Optional[int] = None

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
    
    artist: Optional[UserResponse] = None  # Artist details
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


class QuoteCalculationResponse(BaseModel):
    """Schema for detailed quote calculations used by the quick quote API."""

    base_fee: Decimal
    travel_cost: Decimal
    provider_cost: Decimal
    accommodation_cost: Decimal
    total: Decimal


class QuoteCalculationParams(BaseModel):
    """Schema for the /quotes/calculate request body."""

    base_fee: Decimal
    distance_km: float
    provider_id: Optional[int] = None
    accommodation_cost: Optional[Decimal] = None

