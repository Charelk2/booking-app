# backend/app/models/service.py
from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, Text
from sqlalchemy.orm import relationship
from .base import BaseModel

class Service(BaseModel):
    __tablename__ = "services"

    id          = Column(Integer, primary_key=True, index=True)
    artist_id   = Column(Integer, ForeignKey("artist_profiles.user_id", ondelete="CASCADE"), nullable=False)
    title       = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    price       = Column(Numeric(10, 2), nullable=False)
    duration_minutes = Column(Integer, nullable=False)

    # Link back to the ArtistProfileV2
    artist = relationship("ArtistProfileV2", back_populates="services")

    # ← Here’s the missing piece:
    booking_requests = relationship(
        "BookingRequest",
        back_populates="service",
        cascade="all, delete-orphan",
    )

    # If you also want to link Booking → Service:
    bookings = relationship("Booking", back_populates="service", cascade="all, delete-orphan")

    # If you have a Review model that references Service:
    reviews = relationship("Review", back_populates="service", cascade="all, delete-orphan")
