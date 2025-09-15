from typing import Optional, Dict, Any

from pydantic import BaseModel, model_validator

from ..models.service import ServiceType
from .artist import ArtistProfileNested
from .service_category import ServiceCategoryResponse
from decimal import Decimal
from datetime import datetime


# Shared properties
class ServiceBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    media_url: Optional[str] = None
    duration_minutes: Optional[int] = None
    price: Optional[Decimal] = None
    currency: Optional[str] = "ZAR"
    display_order: Optional[int] = None
    service_type: Optional[ServiceType] = None
    travel_rate: Optional[Decimal] = None
    travel_members: Optional[int] = None
    car_rental_price: Optional[Decimal] = None
    flight_price: Optional[Decimal] = None
    sound_managed_markup_percent: Optional[Decimal] = None
    service_category_id: Optional[int] = None
    # Allow the client to send a category slug like "dj". The API will
    # resolve this slug to a ``service_category_id`` to decouple the
    # frontend from database-specific IDs.
    service_category_slug: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


# Properties to receive on item creation
class ServiceCreate(ServiceBase):
    title: str
    duration_minutes: int
    price: Decimal
    service_type: ServiceType
    media_url: str
    # ``service_category_id`` and ``service_category_slug`` are optional on the
    # base model, but one of them must be supplied when creating a service.

    @model_validator(mode="after")
    def category_required(cls, model: "ServiceCreate") -> "ServiceCreate":
        """Ensure that a service category is provided either by slug or ID."""
        if model.service_category_id is None and not model.service_category_slug:
            raise ValueError(
                "Either service_category_slug or service_category_id must be provided."
            )
        return model


# Properties to receive on item update
class ServiceUpdate(ServiceBase):
    pass


# Properties to return to client
class ServiceResponse(ServiceBase):
    id: int
    artist_id: int  # Foreign key to the artist (user_id of artist)
    artist: Optional[ArtistProfileNested] = None
    service_category: Optional[ServiceCategoryResponse] = None
    display_order: int
    created_at: datetime
    updated_at: datetime
    media_url: str
    # Moderation status: draft | pending_review | approved | rejected
    status: Optional[str] = None
    # Hint for clients to avoid estimator calls when missing
    has_pricebook: Optional[bool] = None

    @model_validator(mode="after")
    def derive_category_slug(cls, model: "ServiceResponse") -> "ServiceResponse":
        """Populate ``service_category_slug`` from the related category."""
        if model.service_category and not model.service_category_slug:
            model.service_category_slug = (
                model.service_category.name.lower().replace(" ", "_")
            )
        return model

    model_config = {"from_attributes": True}
