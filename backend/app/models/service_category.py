from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from .base import BaseModel


class ServiceCategory(BaseModel):
    """Represents a top-level category for service providers."""

    __tablename__ = "service_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    # Relationships
    artists = relationship(
        "ArtistProfileV2",
        back_populates="service_category",
        cascade="all, delete-orphan",
    )
