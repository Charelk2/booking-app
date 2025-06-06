from sqlalchemy.orm import Session
from ..models import User, NotificationType
from ..crud import crud_notification

def notify_user_new_message(
    db: Session, user: User, booking_request_id: int, content: str
) -> None:
    """Create a notification for a new message."""
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.NEW_MESSAGE,
        message=content,
        link=f"/booking-requests/{booking_request_id}",
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
        link=f"/booking-requests/{request_id}",
    )
    print(f"Notify {user.email}: new booking request #{request_id}")


def notify_booking_status_update(
    db: Session,
    user: User,
    request_id: int,
    status: str,
) -> None:
    """Create a notification for a booking status change."""
    crud_notification.create_notification(
        db,
        user_id=user.id,
        type=NotificationType.BOOKING_STATUS_UPDATED,
        message=f"Booking request #{request_id} status updated to {status}",
        link=f"/booking-requests/{request_id}",
    )
    print(
        f"Notify {user.email}: booking request #{request_id} status updated to {status}"
    )
