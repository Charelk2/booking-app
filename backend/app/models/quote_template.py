from sqlalchemy import Column, Integer, ForeignKey, Numeric, String, JSON
from sqlalchemy.orm import relationship

from .base import BaseModel


class QuoteTemplate(BaseModel):
    """Reusable quote template saved per artist."""

    __tablename__ = "quote_templates"

    id = Column(Integer, primary_key=True, index=True)
    artist_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    services = Column(JSON, nullable=False)
    sound_fee = Column(Numeric(10, 2), nullable=False, default=0)
    travel_fee = Column(Numeric(10, 2), nullable=False, default=0)
    accommodation = Column(String, nullable=True)
    discount = Column(Numeric(10, 2), nullable=True)

    artist = relationship("User")
