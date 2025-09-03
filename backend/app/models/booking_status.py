import enum

class BookingStatus(str, enum.Enum):
    """Central booking status enumeration used across the application."""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    DRAFT = "draft"
    PENDING_QUOTE = "pending_quote"
    QUOTE_PROVIDED = "quote_provided"
    PENDING_ARTIST_CONFIRMATION = "pending_artist_confirmation"
    REQUEST_CONFIRMED = "request_confirmed"
    REQUEST_COMPLETED = "request_completed"
    REQUEST_DECLINED = "request_declined"
    REQUEST_WITHDRAWN = "request_withdrawn"
    QUOTE_REJECTED = "quote_rejected"
    # Sound supplier orchestration states
    PENDING_SOUND = "pending_sound"
    FAILED_NO_SOUND = "failed_no_sound"
