from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.orm import Session, selectinload
from typing import List, Any

from ..database import get_db
from ..models.user import User
from ..models import ArtistProfile
from ..models.booking import Booking, BookingStatus
from ..models.review import Review
from ..models.service import Service
from ..schemas.review import ReviewCreate, ReviewResponse, ReviewDetails
from .dependencies import get_current_user, get_current_active_client

# Using a nested route for creating reviews under bookings
router = APIRouter(tags=["Reviews"])

@router.post("/bookings/{booking_id}/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    if booking.client_id != current_client.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only review your own bookings.")

    if booking.status != BookingStatus.COMPLETED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking must be completed to leave a review.")

    existing_review = db.query(Review).filter(Review.booking_id == booking_id).first()
    if existing_review:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Review already submitted for this booking.")

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
    return db_review

@router.get("/reviews/{booking_id}", response_model=ReviewResponse)
def get_review(
    booking_id: int,
    db: Session = Depends(get_db)
) -> Any:
    """
    Get a specific review by its ID (which is the booking_id).
    """
    review = db.query(Review).filter(Review.booking_id == booking_id).first()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found.")
    return review

@router.get("/artist-profiles/{artist_id}/reviews", response_model=List[ReviewDetails])
def list_reviews_for_artist(
    artist_id: int,
    db: Session = Depends(get_db)
) -> Any:
    """
    List all reviews for a specific artist.
    This requires joining through Bookings and Services or directly if Review had artist_id.
    For now, let's assume reviews are primarily linked to bookings.
    """
    # Ensure artist exists
    artist_profile = db.query(ArtistProfile).filter(ArtistProfile.user_id == artist_id).first()
    if not artist_profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist profile not found.")

    reviews = (
        db.query(Review)
        .join(Booking, Review.booking_id == Booking.id)
        .filter(Booking.artist_id == artist_id)
        .options(selectinload(Review.booking))
        .order_by(Review.created_at.desc())
        .all()
    )
    return reviews

@router.get("/services/{service_id}/reviews", response_model=List[ReviewDetails])
def list_reviews_for_service(
    service_id: int,
    db: Session = Depends(get_db)
) -> Any:
    """
    List all reviews for a specific service.
    """
    # Ensure service exists
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    reviews = (
        db.query(Review)
        .join(Booking, Review.booking_id == Booking.id)
        .filter(Booking.service_id == service_id)
        .options(selectinload(Review.booking))
        .order_by(Review.created_at.desc())
        .all()
    )
    return reviews

# No update or delete for reviews for now to keep it simple. 
