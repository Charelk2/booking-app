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
    deposit_amount = Column(Numeric(10, 2), nullable=True, default=0)
    deposit_paid = Column(Boolean, nullable=False, default=False)

    quote = relationship("QuoteV2")
    artist = relationship("User", foreign_keys=[artist_id])
    client = relationship("User", foreign_keys=[client_id])

