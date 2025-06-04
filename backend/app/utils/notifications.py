from ..models import User

def notify_user_new_message(user: User, content: str) -> None:
    # Placeholder for real email or in-app notification
    print(f"Notify {user.email}: new message - {content}")
