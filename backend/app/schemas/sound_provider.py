from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from datetime import datetime

class SoundProviderBase(BaseModel):
    name: Optional[str] = None
    contact_info: Optional[str] = None
    price_per_event: Optional[Decimal] = None

class SoundProviderCreate(SoundProviderBase):
    name: str

class SoundProviderUpdate(SoundProviderBase):
    pass

class SoundProviderResponse(SoundProviderBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class ArtistSoundPreferenceBase(BaseModel):
    provider_id: int
    priority: Optional[int] = None

class ArtistSoundPreferenceResponse(ArtistSoundPreferenceBase):
    id: int
    provider: Optional[SoundProviderResponse] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
