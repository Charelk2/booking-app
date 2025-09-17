from sqlalchemy import (
    Column,
    Integer,
    Text,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Boolean,
    UniqueConstraint,
    Index,
    JSON,
)
from sqlalchemy.orm import relationship, backref
from datetime import datetime, timezone, timedelta
import enum

from .base import BaseModel
from .types import CaseInsensitiveEnum


TZ_GMT2 = timezone(timedelta(hours=2))

class SenderType(str, enum.Enum):
    CLIENT = "client"
    ARTIST = "artist"

class MessageType(str, enum.Enum):
    """Type of message being stored."""

    USER = "USER"
    QUOTE = "QUOTE"
    SYSTEM = "SYSTEM"
    # Legacy value from early schema versions. Treat the same as ``USER``.
    TEXT = "TEXT"


class VisibleTo(str, enum.Enum):
    """Specify who can view a given message."""

    ARTIST = "artist"
    CLIENT = "client"
    BOTH = "both"


class MessageAction(str, enum.Enum):
    """Actions that a system message can trigger on the frontend."""

    REVIEW_QUOTE = "review_quote"
    VIEW_BOOKING_DETAILS = "view_booking_details"


class Message(BaseModel):
    __tablename__ = "messages"
    __table_args__ = (
        # Ensure only one system message per key per booking thread
        UniqueConstraint(
            "booking_request_id",
            "system_key",
            name="uq_messages_request_system_key",
        ),
        # Helpful composite indexes for common filters and ordering
        Index(
            "ix_messages_request_time",
            "booking_request_id",
            "timestamp",
        ),
        Index(
            "ix_messages_request_type_time",
            "booking_request_id",
            "message_type",
            "timestamp",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Normalize legacy uppercase values (e.g., 'CLIENT', 'ARTIST') seamlessly
    sender_type = Column(
        CaseInsensitiveEnum(SenderType, name="sendertype"), nullable=False
    )
    message_type = Column(
        Enum(MessageType), nullable=False, default=MessageType.USER
    )
    # Store enum values ("artist", "client", "both") to match existing DB rows
    # Legacy rows may use uppercase variants like "BOTH". ``CaseInsensitiveEnum``
    # normalizes values to lowercase on read/write so these entries can be
    # loaded without raising lookup errors.
    visible_to = Column(
        CaseInsensitiveEnum(VisibleTo, name="visibleto"),
        nullable=False,
        default=VisibleTo.BOTH,
    )
    content = Column(Text, nullable=False)
    # Link to the newer quotes_v2 table so quote messages render properly
    quote_id = Column(Integer, ForeignKey("quotes_v2.id"), nullable=True)
    attachment_url = Column(String, nullable=True)
    attachment_meta = Column(JSON, nullable=True)
    action = Column(Enum(MessageAction), nullable=True)
    # Optional deterministic key for system messages to dedupe UPSERTs
    system_key = Column(String, nullable=True, index=True)
    # Optional time after which this message should be considered expired
    expires_at = Column(DateTime, nullable=True)
    # Store message timestamps in GMT+2 for consistent chat chronology
    timestamp = Column(
        DateTime(timezone=True), default=lambda: datetime.now(TZ_GMT2)
    )
    is_read = Column(Boolean, default=False)

    booking_request = relationship(
        "BookingRequest",
        backref=backref("messages", cascade="all, delete-orphan"),
    )
    sender = relationship("User")
    quote = relationship("QuoteV2")
    # Optional reply-to reference (same table)
    reply_to_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    reply_to = relationship("Message", remote_side=[id], uselist=False)
