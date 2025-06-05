from pydantic import BaseModel
from datetime import datetime
from ..models.notification import NotificationType


class NotificationCreate(BaseModel):
    user_id: int
    type: NotificationType
    message: str
    link: str


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    type: NotificationType
    message: str
    link: str
    is_read: bool
    timestamp: datetime

    model_config = {"from_attributes": True}


class ThreadNotificationResponse(BaseModel):
    """Aggregated message notifications for a chat thread."""

    booking_request_id: int
    name: str
    unread_count: int
    last_message: str
    link: str
    timestamp: datetime

    model_config = {"from_attributes": True}
