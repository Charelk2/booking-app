from sqlalchemy import Column, Integer, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from .base import BaseModel


class BookingSimple(BaseModel):
    __tablename__ = "bookings_simple"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("quotes_v2.id"), nullable=False)
    artist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    confirmed = Column(Boolean, default=True, nullable=False)

    quote = relationship("QuoteV2")
    artist = relationship("User", foreign_keys=[artist_id])
    client = relationship("User", foreign_keys=[client_id])

