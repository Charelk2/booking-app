from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    Boolean,
    DateTime,
    String,
    Numeric,
    JSON,
)
from sqlalchemy.orm import relationship

from .base import BaseModel


class BookingSimple(BaseModel):
    __tablename__ = "bookings_simple"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("quotes_v2.id"), nullable=False)
    booking_request_id = Column(
        Integer,
        ForeignKey("booking_requests.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    booking_type = Column(String, nullable=False, default="standard", index=True)
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

    # Agent-mode snapshots (optional JSON for immutable billing/provider state)
    provider_profile_snapshot = Column(JSON, nullable=True)
    client_billing_snapshot = Column(JSON, nullable=True)
    # Time-of-supply helper fields (optional)
    payment_classification = Column(String, nullable=True)  # standard_payment|security_deposit
    supply_date = Column(DateTime, nullable=True)

    quote = relationship("QuoteV2")
    booking_request = relationship("BookingRequest")
    artist = relationship("User", foreign_keys=[artist_id])
    client = relationship("User", foreign_keys=[client_id])
