from pydantic import BaseModel, Field
from typing import Optional, List, Annotated
from datetime import datetime
from decimal import Decimal
from ..models.booking_status import BookingStatus # Enum for booking status
from .user import UserResponse # For nesting client details
from .artist import ArtistProfileNested # For nesting artist details (partial)
from .service import ServiceResponse # For nesting service details
from .request_quote import QuoteResponse

# Shared properties for Booking
class BookingBase(BaseModel):
    service_id: int
    start_time: datetime
    end_time: datetime
    notes: Optional[str] = None
    # total_price might be calculated or validated on backend

# Properties to receive on item creation (from a client)
class BookingCreate(BookingBase):
    artist_id: int # Client needs to specify which artist they are booking
    # client_id will be the authenticated user
    # status will be PENDING by default (handled in model or endpoint)
    # total_price should be validated/calculated based on service

# Properties to receive on item update (e.g., artist updating status)
class BookingUpdate(BaseModel):
    status: Optional[BookingStatus] = None
    # Other fields an artist/admin might update, like notes by artist?

# Properties to return to client
class BookingResponse(BookingBase):
    id: int
    artist_id: int # This is the user_id of the artist
    client_id: int
    status: BookingStatus
    total_price: Annotated[Decimal, Field()]
    created_at: datetime
    updated_at: datetime
    payment_status: Optional[str] = None
    booking_request_id: Optional[int] = None

    # Include nested details for frontend dashboard
    client: Optional[UserResponse] = None
    service: Optional[ServiceResponse] = None
    source_quote: Optional[QuoteResponse] = None
    # artist: Optional[ArtistProfileNested] = None # Artist details might be useful too
    # The artist_id field (user_id of artist) is already present.
    # If full ArtistProfileResponse is needed for the artist of the booking, it can be added.
    # For now, client and service are the ones directly accessed in dashboard table.
    
    model_config = {
        "from_attributes": True
    } 
