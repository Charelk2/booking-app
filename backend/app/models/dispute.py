from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func

from .base import BaseModel


class Dispute(BaseModel):
    __tablename__ = "disputes"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="open")
    reason = Column(String, nullable=True)
    assigned_admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    due_at = Column(DateTime, nullable=True)
    notes = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

