import enum
from datetime import date
from sqlalchemy import Column, Integer, ForeignKey, Date, Numeric, String, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship

from .base import BaseModel


class InvoiceStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"


class Invoice(BaseModel):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("quotes_v2.id"), nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings_simple.id"), nullable=False)
    artist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=True)
    amount_due = Column(Numeric(10, 2), nullable=False)
    status = Column(SQLAlchemyEnum(InvoiceStatus), nullable=False, default=InvoiceStatus.UNPAID)
    payment_method = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    pdf_url = Column(String, nullable=True)

    quote = relationship("QuoteV2")
    booking = relationship("BookingSimple")
    artist = relationship("User", foreign_keys=[artist_id])
    client = relationship("User", foreign_keys=[client_id])
