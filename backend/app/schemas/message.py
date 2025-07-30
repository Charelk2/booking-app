from pydantic import BaseModel
from datetime import datetime
from ..models.message import SenderType, MessageType


class MessageCreate(BaseModel):
    content: str
    message_type: MessageType = MessageType.TEXT
    quote_id: int | None = None
    attachment_url: str | None = None


class MessageResponse(BaseModel):
    id: int
    booking_request_id: int
    sender_id: int
    sender_type: SenderType
    message_type: MessageType
    content: str
    quote_id: int | None = None
    attachment_url: str | None = None
    is_read: bool = False
    timestamp: datetime
    avatar_url: str | None = None

    model_config = {
        "from_attributes": True
    }
