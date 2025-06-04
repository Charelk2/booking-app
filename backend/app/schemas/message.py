from pydantic import BaseModel
from datetime import datetime
from ..models.message import SenderType


class MessageCreate(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: int
    booking_request_id: int
    sender_id: int
    sender_type: SenderType
    content: str
    timestamp: datetime

    model_config = {
        "from_attributes": True
    }
