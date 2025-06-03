from sqlalchemy import Column, Integer, String, Numeric
from sqlalchemy.orm import relationship

from .base import BaseModel

class SoundProvider(BaseModel):
    """Company or individual supplying sound equipment."""

    __tablename__ = "sound_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    contact_info = Column(String, nullable=True)
    price_per_event = Column(Numeric(10, 2), nullable=True)

    preferred_by = relationship(
        "ArtistSoundPreference", back_populates="provider", cascade="all, delete-orphan"
    )
