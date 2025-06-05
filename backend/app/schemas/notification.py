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
