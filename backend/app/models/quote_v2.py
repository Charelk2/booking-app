import enum
from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    Numeric,
    String,
    DateTime,
    JSON,
    Enum as SQLAlchemyEnum,
)
from sqlalchemy.orm import relationship

from .base import BaseModel


class QuoteStatusV2(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"


class QuoteV2(BaseModel):
    __tablename__ = "quotes_v2"

    id = Column(Integer, primary_key=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id"), nullable=False)
    artist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    services = Column(JSON, nullable=False)
    sound_fee = Column(Numeric(10, 2), nullable=False, default=0)
    # When true (stored as 'true' string for compatibility), the sound line is firm
    # Note: kept as a simple string column to avoid enum migrations in older DBs
    sound_firm = Column(String, nullable=True)
    travel_fee = Column(Numeric(10, 2), nullable=False, default=0)
    accommodation = Column(String, nullable=True)
    subtotal = Column(Numeric(10, 2), nullable=False)
    discount = Column(Numeric(10, 2), nullable=True)
    total = Column(Numeric(10, 2), nullable=False)
    status = Column(SQLAlchemyEnum(QuoteStatusV2), nullable=False, default=QuoteStatusV2.PENDING)
    expires_at = Column(DateTime, nullable=True)

    booking_request = relationship("BookingRequest")
    artist = relationship("User", foreign_keys=[artist_id])
    client = relationship("User", foreign_keys=[client_id])
