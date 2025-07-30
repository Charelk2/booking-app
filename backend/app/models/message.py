from sqlalchemy import (
    Column,
    Integer,
    Text,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Boolean,
)
from sqlalchemy.orm import relationship, backref
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
    # Link to the newer quotes_v2 table so quote messages render properly
    quote_id = Column(Integer, ForeignKey("quotes_v2.id"), nullable=True)
    attachment_url = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)

    booking_request = relationship(
        "BookingRequest",
        backref=backref("messages", cascade="all, delete-orphan"),
    )
    sender = relationship("User")
    quote = relationship("QuoteV2")
