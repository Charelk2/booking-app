# app/schemas/artist.py

from pydantic import BaseModel, HttpUrl, computed_field, Field
from typing import List, Optional
from decimal import Decimal
from datetime import datetime

from .user import UserResponse  # <-- make sure this points at your nested User schema


#
# ─── 1. SHAREDFIELDS FOR CREATION/UPDATE ────────────────────────────────
#
class ArtistProfileBase(BaseModel):
    business_name: Optional[str] = None
    custom_subtitle: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    hourly_rate: Optional[Decimal] = None

    # If you want to validate that portfolio URLs are valid HTTP(S) URLs, use HttpUrl.
    # Otherwise, feel free to revert to `List[str]` if you truly just want free‐form strings.
    portfolio_urls: Optional[List[HttpUrl]] = None
    portfolio_image_urls: Optional[List[str]] = None

    specialties: Optional[List[str]] = None
    profile_picture_url: Optional[str] = None
    cover_photo_url: Optional[str] = None
    price_visible: Optional[bool] = True

    model_config = {
        # Still needed so that Pydantic can work with ORM objects, but we override below
        "from_attributes": True,
    }


class ArtistProfileCreate(ArtistProfileBase):
    # On creation, business_name becomes required.
    business_name: str  # not Optional anymore


class ArtistProfileUpdate(ArtistProfileBase):
    # Everything is already Optional in ArtistProfileBase, so no need to redeclare.
    pass


#
# ─── 2. RESPONSE MODEL(S) ──────────────────────────────────────────────────
#
class ArtistProfileResponse(ArtistProfileBase):
    # We keep user_id on the ORM side, but we exclude it from the JSON payload
    user_id: int = Field(..., exclude=True)
    created_at: datetime
    updated_at: datetime
    rating: Optional[float] = None
    rating_count: int = 0
    is_available: Optional[bool] = None
    service_price: Optional[Decimal] = None

    # We want to include a nested "user" object when returning an artist profile
    user: Optional[UserResponse] = None

    @computed_field(return_type=int)
    @property
    def id(self) -> int:
        # This exposes `id` in JSON based on the underlying user_id
        return self.user_id

    model_config = {
        "from_attributes": True  # Pydantic V2 equivalent of orm_mode
    }


class ArtistProfileNested(ArtistProfileBase):
    # A simplified nested‐only version (for example if you embed in UserResponse)
    user_id: int = Field(..., exclude=True)
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    @computed_field(return_type=int)
    @property
    def id(self) -> int:
        return self.user_id

    model_config = {
        "from_attributes": True
    }


class ArtistAvailabilityResponse(BaseModel):
    unavailable_dates: List[str]


class PriceBucket(BaseModel):
    """Histogram bucket for price range filtering."""

    min: int
    max: int
    count: int


class ArtistListResponse(BaseModel):
    """Paginated artist list response."""

    data: List[ArtistProfileResponse]
    total: int
    price_distribution: List[PriceBucket]
