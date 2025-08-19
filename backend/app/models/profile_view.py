from sqlalchemy import Column, Integer, ForeignKey
from .base import BaseModel

class ArtistProfileView(BaseModel):
    __tablename__ = "artist_profile_views"

    id = Column(Integer, primary_key=True, index=True)
    artist_id = Column(Integer, ForeignKey("service_provider_profiles.user_id"), nullable=False)
    viewer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
