from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from .base import BaseModel

class ArtistSoundPreference(BaseModel):
    """Join table linking artists to preferred sound providers."""

    __tablename__ = "artist_sound_preferences"
    __table_args__ = (UniqueConstraint("artist_id", "provider_id", name="uq_artist_provider"),)

    id = Column(Integer, primary_key=True, index=True)
    artist_id = Column(Integer, ForeignKey("artist_profiles.user_id", ondelete="CASCADE"), nullable=False)
    provider_id = Column(Integer, ForeignKey("sound_providers.id", ondelete="CASCADE"), nullable=False)
    priority = Column(Integer, nullable=True)

    artist = relationship("ServiceProviderProfile", back_populates="sound_preferences")
    provider = relationship("SoundProvider", back_populates="preferred_by")
