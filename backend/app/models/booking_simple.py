from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    Boolean,
    DateTime,
    String,
    Numeric,
)
from sqlalchemy.orm import relationship

from .base import BaseModel


class BookingSimple(BaseModel):
    __tablename__ = "bookings_simple"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("quotes_v2.id"), nullable=False)
    artist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    confirmed = Column(Boolean, default=True, nullable=False)
    date = Column(DateTime, nullable=True)
    location = Column(String, nullable=True)
    payment_status = Column(String, nullable=False, default="pending")
    payment_id = Column(String, nullable=True)
    # Track total amount charged (for full-charge flows) to support later reconciliation
    charged_total_amount = Column(Numeric(10, 2), nullable=True)
    # Authorization holds (simulated) for artist and sound portions
    artist_hold_id = Column(String, nullable=True)
    artist_hold_status = Column(String, nullable=True)  # authorized|captured|released
    artist_hold_amount = Column(Numeric(10, 2), nullable=True)
    sound_hold_id = Column(String, nullable=True)
    sound_hold_status = Column(String, nullable=True)   # authorized|captured|released
    sound_hold_amount = Column(Numeric(10, 2), nullable=True)

    quote = relationship("QuoteV2")
    artist = relationship("User", foreign_keys=[artist_id])
    client = relationship("User", foreign_keys=[client_id])
