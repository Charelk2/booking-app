from pydantic import BaseModel
from typing import Optional
from ..models.service import ServiceType
from .artist import ArtistProfileNested
from decimal import Decimal
from datetime import datetime


# Shared properties
class ServiceBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    price: Optional[Decimal] = None
    currency: Optional[str] = "ZAR"
    display_order: Optional[int] = None
    service_type: Optional[ServiceType] = None
    travel_rate: Optional[Decimal] = None
    travel_members: Optional[int] = None


# Properties to receive on item creation
class ServiceCreate(ServiceBase):
    title: str
    duration_minutes: int
    price: Decimal
    service_type: ServiceType
    # artist_id will be set based on the authenticated artist, not in schema


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

    model_config = {"from_attributes": True}
