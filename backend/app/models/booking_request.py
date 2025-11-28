from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Numeric,
    JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base
from .booking_status import BookingStatus
from .types import CaseInsensitiveEnum


class BookingRequest(Base):
    """Core booking request thread model (legacy quote relationship removed)."""

    __tablename__ = "booking_requests"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    artist_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    service_id = Column(
        Integer,
        ForeignKey("services.id", ondelete="CASCADE"),
        nullable=True,
    )
    # Link to a parent request so sound-supplier threads can be grouped with artist threads
    parent_booking_request_id = Column(
        Integer,
        ForeignKey("booking_requests.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    message = Column(Text, nullable=True)
    attachment_url = Column(String, nullable=True)
    proposed_datetime_1 = Column(DateTime, nullable=True, index=True)
    proposed_datetime_2 = Column(DateTime, nullable=True, index=True)

    travel_mode = Column(String, nullable=True)
    travel_cost = Column(Numeric(10, 2), nullable=True)
    travel_breakdown = Column(JSON, nullable=True)

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
