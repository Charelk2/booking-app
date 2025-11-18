from pydantic import BaseModel, Field
from typing import Optional, Annotated
from datetime import datetime


class ReviewBase(BaseModel):
  rating: Annotated[int, Field(ge=1, le=5)]
  comment: Optional[str] = None


class ReviewCreate(ReviewBase):
  """Client → provider review payload (booking-bound)."""
  pass


class ReviewResponse(ReviewBase):
  booking_id: int
  created_at: datetime
  updated_at: datetime

  model_config = {"from_attributes": True}


class ReviewDetails(ReviewResponse):
  """Extended provider review details (used for lists)."""
  pass


class ClientReviewBase(BaseModel):
  rating: Annotated[int, Field(ge=1, le=5)]
  comment: Optional[str] = None


class ClientReviewCreate(ClientReviewBase):
  """Provider → client review payload."""
  pass


class ClientReviewResponse(ClientReviewBase):
  booking_id: int
  client_id: int
  provider_id: int
  created_at: datetime

  model_config = {"from_attributes": True}
