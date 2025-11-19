from fastapi import APIRouter, Depends, status, Path
from sqlalchemy.orm import Session, selectinload
from typing import List, Any

from ..database import get_db
from ..models.user import User, UserType
from ..models import ServiceProviderProfile, ClientReview
from ..models import Booking, BookingStatus
from ..models.review import Review
from ..models.service import Service
from ..schemas.review import (
    ReviewCreate,
    ReviewResponse,
    ReviewDetails,
    ClientReviewCreate,
    ClientReviewResponse,
)
from .dependencies import get_current_user, get_current_active_client, get_current_service_provider
from ..utils import error_response

# Using a nested route for creating reviews under bookings
router = APIRouter(tags=["Reviews"])


@router.post(
    "/bookings/{booking_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_review_for_booking(
    *,
    db: Session = Depends(get_db),
    booking_id: int = Path(..., title="The ID of the booking to review"),
    review_in: ReviewCreate,
    current_client: User = Depends(get_current_active_client)
) -> Any:
    """
    Create a review for a specific booking.
    Only the client who made the booking can review it, and only if it's completed.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise error_response(
            "Booking not found.",
            {"booking_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    if booking.client_id != current_client.id:
        raise error_response(
            "You can only review your own bookings.",
            {},
            status.HTTP_403_FORBIDDEN,
        )

    if booking.status != BookingStatus.COMPLETED:
        raise error_response(
            "Booking must be completed to leave a review.",
            {},
            status.HTTP_400_BAD_REQUEST,
        )

    existing_review = db.query(Review).filter(Review.booking_id == booking_id).first()
    if existing_review:
        raise error_response(
            "Review already submitted for this booking.",
            {"booking_id": "review_exists"},
            status.HTTP_400_BAD_REQUEST,
        )

    db_review = Review(
        booking_id=booking.id,
        artist_id=booking.artist_id,
        service_id=booking.service_id,
        rating=review_in.rating,
        comment=review_in.comment,
    )

    db.add(db_review)
    db.commit()
    db.refresh(db_review)
    # Defensive: ensure timestamps present
    try:
        from datetime import datetime as _dt
        if not getattr(db_review, "created_at", None):
            db_review.created_at = getattr(db_review, "updated_at", None) or _dt.utcnow()
        if not getattr(db_review, "updated_at", None):
            db_review.updated_at = db_review.created_at
        db.add(db_review)
        db.commit()
        db.refresh(db_review)
    except Exception:
        pass
    return db_review


@router.get("/reviews/{booking_id}", response_model=ReviewResponse)
def get_review(booking_id: int, db: Session = Depends(get_db)) -> Any:
    """
    Get a specific review by its ID (which is the booking_id).
    """
    review = db.query(Review).filter(Review.booking_id == booking_id).first()
    if not review:
        raise error_response(
            "Review not found.",
            {"booking_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    # Coalesce timestamps on legacy rows
    try:
        from datetime import datetime as _dt
        if not getattr(review, "created_at", None):
            review.created_at = getattr(review, "updated_at", None) or _dt.utcnow()
        if not getattr(review, "updated_at", None):
            review.updated_at = review.created_at
        db.add(review)
        db.commit()
        db.refresh(review)
    except Exception:
        pass
    return review


@router.get("/service-provider-profiles/{service_provider_id}/reviews", response_model=List[ReviewDetails])
def list_reviews_for_service_provider(service_provider_id: int, db: Session = Depends(get_db)) -> Any:
    """
    List all reviews for a specific service provider.
    This requires joining through Bookings and Services or directly if Review had artist_id.
    For now, let's assume reviews are primarily linked to bookings.
    """
    # Ensure service provider exists
    service_provider_profile = (
        db.query(ServiceProviderProfile)
        .filter(ServiceProviderProfile.user_id == service_provider_id)
        .first()
    )
    # Return an empty list instead of 404 so UI can gracefully render when
    # a provider profile was deleted or hasn't been created yet.
    if not service_provider_profile:
        return []

    reviews = (
        db.query(Review)
        .join(Booking, Review.booking_id == Booking.id)
        .filter(Booking.artist_id == service_provider_id)
        .options(selectinload(Review.booking).selectinload(Booking.client))
        .order_by(Review.created_at.desc())
        .all()
    )
    # Coalesce timestamps on legacy rows
    try:
        from datetime import datetime as _dt
        for r in reviews:
            if not getattr(r, "created_at", None):
                r.created_at = getattr(r, "updated_at", None) or _dt.utcnow()
            if not getattr(r, "updated_at", None):
                r.updated_at = r.created_at
        db.commit()
    except Exception:
        pass
    # Attach lightweight client identity so the frontend can show
    # which client left each review.
    for r in reviews:
        try:
            booking = getattr(r, "booking", None)
            client = getattr(booking, "client", None) if booking is not None else None
            if client is None:
                continue
            try:
                setattr(r, "client_id", int(getattr(client, "id")))
            except Exception:
                # Skip id if it isn't an int
                pass
            first_name = getattr(client, "first_name", None)
            last_name = getattr(client, "last_name", None)
            setattr(r, "client_first_name", first_name)
            setattr(r, "client_last_name", last_name)
            display = f"{first_name or ''} {last_name or ''}".strip()
            setattr(r, "client_display_name", display or None)
        except Exception:
            continue
    return reviews


@router.get("/services/{service_id}/reviews", response_model=List[ReviewDetails])
def list_reviews_for_service(service_id: int, db: Session = Depends(get_db)) -> Any:
    """
    List all reviews for a specific service.
    """
    # Ensure service exists
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise error_response(
            "Service not found.",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    reviews = (
        db.query(Review)
        .join(Booking, Review.booking_id == Booking.id)
        .filter(Booking.service_id == service_id)
        .options(selectinload(Review.booking))
        .order_by(Review.created_at.desc())
        .all()
    )
    # Coalesce timestamps on legacy rows
    try:
        from datetime import datetime as _dt
        for r in reviews:
            if not getattr(r, "created_at", None):
                r.created_at = getattr(r, "updated_at", None) or _dt.utcnow()
            if not getattr(r, "updated_at", None):
                r.updated_at = r.created_at
        db.commit()
    except Exception:
        pass
    return reviews


# No update or delete for reviews for now to keep it simple.


@router.post(
    "/client/bookings/{booking_id}/reviews",
    response_model=ClientReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_client_review_for_booking(
    *,
    db: Session = Depends(get_db),
    booking_id: int = Path(..., title="The ID of the booking to review as a client"),
    review_in: ClientReviewCreate,
    current_provider: User = Depends(get_current_service_provider),
) -> Any:
    """
    Create a provider → client review for a specific booking.

    Only the artist who owned the booking may review the client, and only once
    the booking is completed.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise error_response(
            "Booking not found.",
            {"booking_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    if booking.artist_id != current_provider.id:
        raise error_response(
            "You can only review clients for your own bookings.",
            {},
            status.HTTP_403_FORBIDDEN,
        )

    if booking.status != BookingStatus.COMPLETED:
        raise error_response(
            "Booking must be completed to leave a review.",
            {},
            status.HTTP_400_BAD_REQUEST,
        )

    existing = (
        db.query(ClientReview)
        .filter(ClientReview.booking_id == booking_id)
        .first()
    )
    if existing:
        raise error_response(
            "Review already submitted for this booking.",
            {"booking_id": "review_exists"},
            status.HTTP_400_BAD_REQUEST,
        )

    db_review = ClientReview(
        booking_id=booking.id,
        client_id=booking.client_id,
        provider_id=booking.artist_id,
        rating=review_in.rating,
        comment=review_in.comment,
    )
    db.add(db_review)
    db.commit()
    db.refresh(db_review)
    return db_review
