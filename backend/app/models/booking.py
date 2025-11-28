# backend/app/models/booking.py

from sqlalchemy import Column, Integer, DateTime, Numeric, ForeignKey, String
from sqlalchemy.orm import relationship

from .base import BaseModel
from .booking_status import BookingStatus
from .types import CaseInsensitiveEnum

class Booking(BaseModel):
    __tablename__ = "bookings"

    id         = Column(Integer, primary_key=True, index=True)
    artist_id  = Column(Integer, ForeignKey("service_provider_profiles.user_id"), index=True)
    client_id  = Column(Integer, ForeignKey("users.id"))
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"))
    start_time = Column(DateTime, nullable=False, index=True)
    end_time   = Column(DateTime, nullable=False)
    status     = Column(
        CaseInsensitiveEnum(BookingStatus, name="bookingstatus"),
        default=BookingStatus.PENDING,
        index=True,
    )
    total_price= Column(Numeric(10, 2), nullable=False)  # ← Numeric is now imported
    notes      = Column(String)
    event_city = Column(String, nullable=True)
    artist_accept_deadline_at = Column(DateTime, nullable=True)
    quote_id   = Column(Integer, ForeignKey("quotes_v2.id"), nullable=True)
    
    # Relationships
    artist       = relationship("ServiceProviderProfile", back_populates="bookings")
    client       = relationship("User", foreign_keys=[client_id], back_populates="bookings_as_client")
    service      = relationship("Service", back_populates="bookings")
    review       = relationship("Review", back_populates="booking", uselist=False)
    source_quote = relationship("QuoteV2", backref="booking", uselist=False)
