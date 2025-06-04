from ..models import User

def notify_user_new_message(user: User, content: str) -> None:
    # Placeholder for real email or in-app notification
    print(f"Notify {user.email}: new message - {content}")


def notify_user_new_booking_request(user: User, request_id: int) -> None:
    """Placeholder notification for a new booking request."""
    print(f"Notify {user.email}: new booking request #{request_id}")
