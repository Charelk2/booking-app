from pydantic import BaseModel, Field
from typing import Optional, Annotated
from datetime import datetime

# Shared properties for Review
class ReviewBase(BaseModel):
    rating: Annotated[int, Field(ge=1, le=5)] # Rating between 1 and 5
    comment: Optional[str] = None

# Properties to receive on item creation (from a client for a specific booking)
class ReviewCreate(ReviewBase):
    # booking_id will be a path parameter or derived, not in body typically for creating a review on a booking
    pass

# Properties to receive on item update (if reviews are updatable)
# For now, let's assume reviews are not updatable once created to keep it simple.
# class ReviewUpdate(ReviewBase):
#     pass

# Properties to return to client
class ReviewResponse(ReviewBase):
    booking_id: int # The booking_id (PK) should be part of the response
    # Optionally, include client_id or partial client info if needed for display, but needs careful thought on data exposure.
    # client_id: int 
    created_at: datetime
    updated_at: datetime
    
    model_config = {
        "from_attributes": True
    }

# Schema for listing reviews, possibly with more context
class ReviewDetails(ReviewResponse): # Inherits from ReviewResponse
    # Could include nested booking info, client info, or artist info if needed
    # For example:
    # from .booking import BookingMinimalResponse # (Hypothetical schema)
    # booking: Optional[BookingMinimalResponse] = None
    pass 