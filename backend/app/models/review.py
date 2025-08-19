from sqlalchemy import Column, Integer, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import BaseModel

class Review(BaseModel):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    booking_id  = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    service_id  = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    artist_id   = Column(Integer, ForeignKey("service_provider_profiles.user_id"), nullable=False)

    rating      = Column(Integer, nullable=False)
    comment     = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    # Relationships
    #   Each Review is attached to exactly one Booking
    booking = relationship(
        "Booking",
        back_populates="review"
    )

    #   Each Review is attached to exactly one Service
    service = relationship(
        "Service",
        back_populates="reviews"
    )

    #   Each Review belongs to exactly one ServiceProviderProfile
    artist = relationship(
        "ServiceProviderProfile",
        back_populates="reviews"
    )
