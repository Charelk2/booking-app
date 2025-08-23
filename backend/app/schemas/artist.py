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
    cancellation_policy: Optional[str] = None

    # Contact details shared with the client on confirmation
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_website: Optional[str] = None

    # Banking details (optional)
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch_code: Optional[str] = None

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
    service_categories: List[str] = Field(default_factory=list)
    onboarding_completed: Optional[bool] = None
    # Derived convenience field for clients to check completion status
    @computed_field(return_type=bool)
    @property
    def profile_complete(self) -> bool:
        # Simple mirror of backend util; keep light to avoid import cycles
        import re
        def nonempty(v: Optional[str]) -> bool:
            return bool(v and str(v).strip())
        def valid_email(v: Optional[str]) -> bool:
            return bool(v and re.match(r"[^@]+@[^@]+\.[^@]+", v))
        def valid_phone(v: Optional[str]) -> bool:
            return bool(v and re.match(r"^\+27\d{9}$", v))
        def likely_url(v: Optional[str]) -> bool:
            return bool(v and re.match(r"^(https?://)?[\w.-]+\.[A-Za-z]{2,}", v))
        has_specialties = isinstance(self.specialties, list) and any(bool(s) for s in (self.specialties or []))
        has_policy = True if self.cancellation_policy is None else nonempty(self.cancellation_policy)
        return all([
            nonempty(self.business_name),
            nonempty(self.description),
            nonempty(self.location),
            valid_email(self.contact_email),
            valid_phone(self.contact_phone),
            likely_url(self.contact_website),
            has_specialties,
            has_policy,
        ])

    # We want to include a nested "user" object when returning a service provider profile
    user: Optional[UserResponse] = None

    @computed_field(return_type=int)
    @property
    def id(self) -> int:
        # This exposes `id` in JSON based on the underlying user_id
        return self.user_id

    model_config = {"from_attributes": True}  # Pydantic V2 equivalent of orm_mode


class ArtistProfileNested(ArtistProfileBase):
    # A simplified nested‐only version (for example if you embed in UserResponse)
    user_id: int = Field(..., exclude=True)
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    @computed_field(return_type=int)
    @property
    def id(self) -> int:
        return self.user_id

    model_config = {"from_attributes": True}


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
