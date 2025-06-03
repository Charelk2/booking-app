from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from datetime import datetime

# Shared properties
class ServiceBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    price: Optional[Decimal] = None

# Properties to receive on item creation
class ServiceCreate(ServiceBase):
    name: str
    duration_minutes: int
    price: Decimal
    # artist_id will be set based on the authenticated artist, not in schema

# Properties to receive on item update
class ServiceUpdate(ServiceBase):
    pass

# Properties to return to client
class ServiceResponse(ServiceBase):
    id: int
    artist_id: int # Foreign key to the artist (user_id of artist)
    created_at: datetime
    updated_at: datetime
    
    model_config = {
        "from_attributes": True
    } 