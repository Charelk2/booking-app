from pydantic import BaseModel
from typing import Optional, Dict, Any
from ..models.service import ServiceType
from .artist import ArtistProfileNested
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
    service_category_id: Optional[int] = None
    details: Optional[Dict[str, Any]] = None


# Properties to receive on item creation
class ServiceCreate(ServiceBase):
    title: str
    duration_minutes: int
    price: Decimal
    service_type: ServiceType
    media_url: str
    # ``service_category_id`` is optional and inherited from ``ServiceBase``.
    # The artist ID will be set based on the authenticated artist, not in the schema.


# Properties to receive on item update
class ServiceUpdate(ServiceBase):
    pass


# Properties to return to client
class ServiceResponse(ServiceBase):
    id: int
    artist_id: int  # Foreign key to the artist (user_id of artist)
    artist: Optional[ArtistProfileNested] = None
    display_order: int
    created_at: datetime
    updated_at: datetime
    media_url: str

    model_config = {"from_attributes": True}
