# backend/app/models/service_provider_profile.py

from sqlalchemy import (
    Column,
    String,
    Text,
    Numeric,
    ForeignKey,
    JSON,
    Integer,
    Boolean,
)
from sqlalchemy.orm import relationship

from .base import BaseModel      # ← import BaseModel directly


class ServiceProviderProfile(BaseModel):
    """ORM model representing a service provider's profile."""

    __tablename__ = "artist_profiles"

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        unique=True,
        nullable=False,
        index=True,
    )
    business_name = Column(String, index=True, nullable=True)
    custom_subtitle = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    hourly_rate = Column(Numeric(10, 2), nullable=True)
    portfolio_urls = Column(JSON, nullable=True)
    portfolio_image_urls = Column(JSON, nullable=True)
    specialties = Column(JSON, nullable=True)
    profile_picture_url = Column(String, nullable=True)
    cover_photo_url = Column(String, nullable=True)
    price_visible = Column(Boolean, nullable=False, default=True)

    # Relationships
    user = relationship("User", back_populates="artist_profile")
    services = relationship(
        "Service",
        back_populates="artist",
        cascade="all, delete-orphan",
    )
    bookings = relationship(
        "Booking",
        back_populates="artist",
        cascade="all, delete-orphan",
    )
    reviews = relationship(
        "Review",
        back_populates="artist",
        cascade="all, delete-orphan",
    )

