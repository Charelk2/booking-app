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
    quote_details = Column(String, nullable=True)
    sound_fee = Column(Numeric(10, 2), nullable=False, default=0)
    # When true (stored as 'true' string for compatibility), the sound line is firm
    # Note: kept as a simple string column to avoid enum migrations in older DBs
    sound_firm = Column(String, nullable=True)
    travel_fee = Column(Numeric(10, 2), nullable=False, default=0)
    accommodation = Column(String, nullable=True)
    subtotal = Column(Numeric(10, 2), nullable=False)
    discount = Column(Numeric(10, 2), nullable=True)
    total = Column(Numeric(10, 2), nullable=False)
    # Persist lowercase values to match existing Postgres enum definitions
    status = Column(
        SQLAlchemyEnum(
            QuoteStatusV2,
            name="quotestatusv2",
            values_callable=lambda enum: [e.value for e in enum],
        ),
        nullable=False,
        default=QuoteStatusV2.PENDING,
    )
    expires_at = Column(DateTime, nullable=True)

    booking_request = relationship("BookingRequest", back_populates="quotes")
    artist = relationship("User", foreign_keys=[artist_id])
    client = relationship("User", foreign_keys=[client_id])

    def __init__(self, **kwargs):
        """Allow legacy kwargs (quote_details/price/currency) for compatibility."""
        legacy_details = kwargs.pop("quote_details", None)
        legacy_price = kwargs.pop("price", None)
        legacy_currency = kwargs.pop("currency", None)
        # Backfill required fields with safe defaults when omitted
        kwargs.setdefault("client_id", kwargs.get("artist_id"))
        kwargs.setdefault("services", [])
        kwargs.setdefault("subtotal", legacy_price or kwargs.get("total") or 0)
        kwargs.setdefault("total", kwargs.get("subtotal") or legacy_price or 0)
        super().__init__(**kwargs)
        if legacy_details:
            try:
                services_list = list(self.services or [])
            except Exception:
                services_list = []
            if not services_list:
                services_list = [
                    {
                        "description": str(legacy_details),
                        "price": str(legacy_price) if legacy_price is not None else None,
                        "currency": legacy_currency,
                    }
                ]
            self.services = services_list
