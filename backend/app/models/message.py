from sqlalchemy import Column, Integer, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from .base import BaseModel

class SenderType(str, enum.Enum):
    CLIENT = "client"
    ARTIST = "artist"

class MessageType(str, enum.Enum):
    TEXT = "text"
    QUOTE = "quote"
    SYSTEM = "system"


class Message(BaseModel):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sender_type = Column(Enum(SenderType), nullable=False)
    message_type = Column(Enum(MessageType), nullable=False, default=MessageType.TEXT)
    content = Column(Text, nullable=False)
    quote_id = Column(Integer, ForeignKey("quotes.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    booking_request = relationship("BookingRequest", backref="messages")
    sender = relationship("User")
    quote = relationship("Quote")
