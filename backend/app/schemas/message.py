from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from ..models.message import SenderType, MessageType, VisibleTo, MessageAction


class MessageCreate(BaseModel):
    content: str
    message_type: MessageType = MessageType.USER
    visible_to: VisibleTo = VisibleTo.BOTH
    quote_id: int | None = None
    attachment_url: str | None = None
    action: MessageAction | None = None
    expires_at: Optional[datetime] = None


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
    expires_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True
    }
