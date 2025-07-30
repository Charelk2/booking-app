from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from .base import BaseModel

class NotificationType(str, enum.Enum):
    NEW_MESSAGE = "new_message"
    NEW_BOOKING_REQUEST = "new_booking_request"
    BOOKING_STATUS_UPDATED = "booking_status_updated"
    QUOTE_ACCEPTED = "quote_accepted"
    QUOTE_EXPIRED = "quote_expired"
    QUOTE_EXPIRING = "quote_expiring"
    NEW_BOOKING = "new_booking"
    DEPOSIT_DUE = "deposit_due"
    REVIEW_REQUEST = "review_request"

class Notification(BaseModel):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(Enum(NotificationType), nullable=False)
    message = Column(String, nullable=False)
    link = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="notifications")
