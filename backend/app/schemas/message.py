from typing import Optional
from datetime import datetime
from pydantic import BaseModel, field_validator

from ..models.message import SenderType, MessageType, VisibleTo, MessageAction


class MessageCreate(BaseModel):
    content: str
    message_type: MessageType = MessageType.USER
    visible_to: VisibleTo = VisibleTo.BOTH
    quote_id: int | None = None
    attachment_url: str | None = None
    action: MessageAction | None = None
    # For SYSTEM messages only; allows UPSERT by unique key
    system_key: str | None = None
    expires_at: Optional[datetime] = None

    @field_validator("message_type", mode="before")
    @classmethod
    def normalize_message_type(cls, v: str):
        """Allow legacy or lowercase message types by normalizing input."""
        if isinstance(v, str):
            mapping = {
                "TEXT": MessageType.USER,
                "USER": MessageType.USER,
                "QUOTE": MessageType.QUOTE,
                "SYSTEM": MessageType.SYSTEM,
            }
            key = v.upper()
            if key in mapping:
                return mapping[key]
        raise ValueError("message_type must be USER, QUOTE, or SYSTEM")


class MessageResponse(BaseModel):
    id: int
    booking_request_id: int
    sender_id: int
    sender_type: SenderType
    message_type: MessageType
    visible_to: VisibleTo
    content: str
    quote_id: int | None = None
    attachment_url: str | None = None
    action: MessageAction | None = None
    is_read: bool = False
    timestamp: datetime
    avatar_url: str | None = None
    system_key: str | None = None
    expires_at: Optional[datetime] = None

    @field_validator("message_type", mode="before")
    @classmethod
    def normalize_message_type(cls, v):
        """Map legacy ``TEXT`` values to ``USER`` for consistent output."""
        if v == MessageType.TEXT or (isinstance(v, str) and v.upper() == "TEXT"):
            return MessageType.USER
        return v

    model_config = {"from_attributes": True}
