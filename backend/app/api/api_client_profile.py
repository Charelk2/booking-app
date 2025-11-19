from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import Any
from datetime import datetime

from ..database import get_db
from ..models import User, Booking, BookingStatus, ClientReview, ServiceProviderProfile, Service
from .dependencies import get_current_user
from ..utils import error_response


router = APIRouter(tags=["Client Profiles"])


@router.get("/users/{user_id}/profile")
def read_client_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Return a lightweight client profile summary for display in the inbox.

    Providers use this to understand a client's history and reputation.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise error_response(
            "User not found.",
            {"user_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    # Completed and cancelled events for this client
    completed_q = (
        db.query(Booking)
        .filter(
            Booking.client_id == user_id,
            Booking.status == BookingStatus.COMPLETED,
        )
    )
    cancelled_q = (
        db.query(Booking)
        .filter(
            Booking.client_id == user_id,
            Booking.status == BookingStatus.CANCELLED,
        )
    )
    completed_count = completed_q.count()
    cancelled_count = cancelled_q.count()

    # Provider → client reviews
    reviews_q = (
        db.query(ClientReview, Booking, ServiceProviderProfile, Service)
        .join(Booking, ClientReview.booking_id == Booking.id)
        .join(ServiceProviderProfile, ServiceProviderProfile.user_id == ClientReview.provider_id)
        .join(Service, Service.id == Booking.service_id)
        .filter(ClientReview.client_id == user_id)
        .order_by(ClientReview.created_at.desc())
    )
    rows = reviews_q.all()
    ratings = [int(cr.rating or 0) for (cr, *_rest) in rows]
    avg_rating = sum(ratings) / len(ratings) if ratings else None

    reviews_payload = []
    for cr, booking, prof, svc in rows[:20]:
        try:
            reviews_payload.append(
                {
                    "id": int(cr.id),
                    "rating": int(cr.rating),
                    "comment": cr.comment or "",
                    "created_at": (cr.created_at or datetime.utcnow()).isoformat(),
                    "provider": {
                        "id": int(prof.user_id),
                        "business_name": prof.business_name,
                        "profile_picture_url": getattr(prof, "profile_picture_url", None),
                        "location": getattr(prof, "location", None),
                        "city": getattr(booking, "event_city", None),
                    },
                    "booking": {
                        "id": int(booking.id),
                        "event_date": (booking.start_time or booking.end_time).isoformat()
                        if getattr(booking, "start_time", None) or getattr(booking, "end_time", None)
                        else None,
                        "service_title": svc.title,
                    },
                }
            )
        except Exception:
            continue

    # Basic verifications snapshot
    email_verified = bool(user.is_verified)
    phone_verified = bool(user.phone_number)
    payment_verified = completed_count > 0

    created_at = getattr(user, "created_at", None)
    member_since_year = created_at.year if isinstance(created_at, datetime) else None

    return {
        "user": {
            "id": int(user.id),
            "first_name": user.first_name,
            "last_name": user.last_name,
            "profile_picture_url": getattr(user, "profile_picture_url", None),
            "member_since_year": member_since_year,
        },
        "stats": {
            "completed_events": int(completed_count),
            "cancelled_events": int(cancelled_count),
            "avg_rating": float(avg_rating) if avg_rating is not None else None,
            "reviews_count": len(ratings),
        },
        "verifications": {
            "email_verified": email_verified,
            "phone_verified": phone_verified,
            "payment_verified": payment_verified,
        },
        "reviews": reviews_payload,
    }
