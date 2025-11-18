from sqlalchemy import Column, Integer, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from .base import BaseModel


class ClientReview(BaseModel):
    __tablename__ = "client_reviews"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider_id = Column(
        Integer, ForeignKey("service_provider_profiles.user_id"), nullable=False, index=True
    )

    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    booking = relationship("Booking")
    client = relationship("User")
    provider = relationship("ServiceProviderProfile")

