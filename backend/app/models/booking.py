# backend/app/models/booking.py

from sqlalchemy import Column, Integer, DateTime, Numeric, ForeignKey, Enum, String
from sqlalchemy.orm import relationship

from .base import BaseModel
from .booking_status import BookingStatus

class Booking(BaseModel):
    __tablename__ = "bookings"

    id         = Column(Integer, primary_key=True, index=True)
    artist_id  = Column(Integer, ForeignKey("artist_profiles.user_id"))
    client_id  = Column(Integer, ForeignKey("users.id"))
    service_id = Column(Integer, ForeignKey("services.id"))
    start_time = Column(DateTime, nullable=False)
    end_time   = Column(DateTime, nullable=False)
    status     = Column(Enum(BookingStatus), default=BookingStatus.PENDING)
    total_price= Column(Numeric(10, 2), nullable=False)  # ← Numeric is now imported
    notes      = Column(String)
    quote_id   = Column(Integer, ForeignKey("quotes.id"), nullable=True)
    
    # Relationships
    artist       = relationship("ArtistProfileV2", back_populates="bookings")
    client       = relationship("User", foreign_keys=[client_id], back_populates="bookings_as_client")
    service      = relationship("Service", back_populates="bookings")
    review       = relationship("Review", back_populates="booking", uselist=False)
    source_quote = relationship("Quote", backref="booking", uselist=False)
