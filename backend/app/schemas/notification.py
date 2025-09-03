from pydantic import BaseModel
from datetime import datetime
from ..models.notification import NotificationType


class BookingDetailsSummary(BaseModel):
    timestamp: datetime
    location: str | None = None
    guests: str | None = None
    venue_type: str | None = None
    notes: str | None = None


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
    sender_name: str | None = None
    booking_type: str | None = None
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class ThreadNotificationResponse(BaseModel):
    """Aggregated message notifications for a chat thread."""

    booking_request_id: int
    name: str
    unread_count: int
    last_message: str
    link: str
    timestamp: datetime
    avatar_url: str | None = None
    booking_details: BookingDetailsSummary | None = None

    model_config = {"from_attributes": True}
