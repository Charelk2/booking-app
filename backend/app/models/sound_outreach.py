from __future__ import annotations

import enum
from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    DateTime,
    Numeric,
    String,
    Enum as SQLAlchemyEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import BaseModel


class OutreachStatus(str, enum.Enum):
    SENT = "sent"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"


class SoundOutreachRequest(BaseModel):
    """Outbound request to a sound supplier for a specific booking.

    One booking may have multiple rows (primary, backup1, backup2). Exactly one
    row can become ACCEPTED and is the winner for the booking.
    """

    __tablename__ = "sound_outreach_requests"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False)

    status = Column(SQLAlchemyEnum(OutreachStatus), nullable=False, default=OutreachStatus.SENT, index=True)
    expires_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)

    # Used to gate simultaneous accepts – must match on response
    lock_token = Column(String, nullable=False, index=True)

    # Price the supplier accepted at (firm)
    accepted_amount = Column(Numeric(10, 2), nullable=True)

    # Link to the supplier chat thread (BookingRequest) and the supplier's quote, if used
    supplier_booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL"), nullable=True)
    # Reference the v2 quotes table (quotes_v2) since v1 quotes table is absent in the current schema.
    supplier_quote_id = Column(Integer, ForeignKey("quotes_v2.id", ondelete="SET NULL"), nullable=True)

    # Helpful denormalized fields for white‑label timeline and audit
    supplier_public_name = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    booking = relationship("Booking")
    supplier_service = relationship("Service")
