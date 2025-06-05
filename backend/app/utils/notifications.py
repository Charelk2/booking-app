from sqlalchemy.orm import Session
from ..models import User, NotificationType
from ..crud import crud_notification

def notify_user_new_message(db: Session, user: User, content: str) -> None:
    """Create a notification for a new message."""
    crud_notification.create_notification(
        db, user_id=user.id, type=NotificationType.NEW_MESSAGE, message=content
    )
    # Placeholder for real email or in-app push
    print(f"Notify {user.email}: new message - {content}")


def notify_user_new_booking_request(db: Session, user: User, request_id: int) -> None:
    """Create a notification for a new booking request."""
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.NEW_BOOKING_REQUEST,
        message=f"New booking request #{request_id}",
    )
    print(f"Notify {user.email}: new booking request #{request_id}")
