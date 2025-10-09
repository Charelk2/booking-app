from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLAlchemyEnum, Numeric, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from ..database import Base # Assuming Base is in database.py
from .booking_status import BookingStatus
from .types import CaseInsensitiveEnum

class QuoteStatus(str, enum.Enum):
    PENDING_CLIENT_ACTION = "pending_client_action"
    ACCEPTED_BY_CLIENT = "accepted_by_client"
    REJECTED_BY_CLIENT = "rejected_by_client"
    CONFIRMED_BY_ARTIST = "confirmed_by_artist"
    WITHDRAWN_BY_ARTIST = "withdrawn_by_artist"
    EXPIRED = "expired"

class BookingRequest(Base):
    __tablename__ = "booking_requests"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    artist_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True) # The artist's user_id
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=True) # Optional

    message = Column(Text, nullable=True)
    attachment_url = Column(String, nullable=True)
    proposed_datetime_1 = Column(DateTime, nullable=True, index=True)
    proposed_datetime_2 = Column(DateTime, nullable=True, index=True)

    travel_mode = Column(String, nullable=True)
    travel_cost = Column(Numeric(10, 2), nullable=True)
    travel_breakdown = Column(JSON, nullable=True)
    
    # Use a case-insensitive enum bound to the shared Postgres type 'bookingstatus'
    status = Column(
        CaseInsensitiveEnum(BookingStatus, name="bookingstatus"),
        nullable=False,
        default=BookingStatus.PENDING_QUOTE,
        index=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    client = relationship("User", foreign_keys=[client_id], back_populates="booking_requests_as_client")
    artist = relationship("User", foreign_keys=[artist_id], back_populates="booking_requests_as_artist")
    service = relationship("Service", back_populates="booking_requests")
    
    quotes = relationship("Quote", back_populates="booking_request", cascade="all, delete-orphan")

class Quote(Base):
    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id"), nullable=False)
    artist_id = Column(Integer, ForeignKey("users.id"), nullable=False) # Artist who made the quote (should match request's artist)
    
    quote_details = Column(Text, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="ZAR") # e.g., ZAR, EUR
    valid_until = Column(DateTime, nullable=True) # Quote expiry date

    status = Column(
        SQLAlchemyEnum(QuoteStatus, values_callable=lambda enum: [e.value for e in enum]),
        nullable=False,
        default=QuoteStatus.PENDING_CLIENT_ACTION,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    booking_request = relationship("BookingRequest", back_populates="quotes")
    artist = relationship("User", foreign_keys=[artist_id]) # Relationship to the artist user who made the quote.
    # If a booking is created from this quote:
    # booking = relationship("Booking", back_populates="source_quote", uselist=False) # One-to-one if a booking is directly tied

# Add relationships to User model
# User.booking_requests_as_client = relationship("BookingRequest", foreign_keys=[BookingRequest.client_id], back_populates="client")
# User.booking_requests_as_artist = relationship("BookingRequest", foreign_keys=[BookingRequest.artist_id], back_populates="artist")

# Add relationship to Service model
# Service.booking_requests = relationship("BookingRequest", back_populates="service")

# Consider how Booking model (in models/booking.py) relates.
# If a booking is made AFTER a quote is accepted and artist confirms:
# Booking.quote_id = Column(Integer, ForeignKey("quotes.id"), nullable=True)
# Booking.source_quote = relationship("Quote", back_populates="booking") 
