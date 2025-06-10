from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas

class CRUDReview:
    def get_review(self, db: Session, review_id: int) -> Optional[models.Review]:
        # Assuming Review has a simple integer primary key named 'id'
        # If primary key is composite or named differently, adjust query.
        return db.query(models.Review).filter(models.Review.id == review_id).first()

    def get_reviews_by_artist(
        self, db: Session, artist_id: int, skip: int = 0, limit: int = 100
    ) -> List[models.Review]:
        return (
            db.query(models.Review)
            .join(models.Booking, models.Review.booking_id == models.Booking.id)
            .filter(models.Booking.artist_id == artist_id)
            .order_by(models.Review.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_reviews_by_booking(
        self, db: Session, booking_id: int
    ) -> Optional[models.Review]: # A booking usually has one review
        return db.query(models.Review).filter(models.Review.booking_id == booking_id).first()

    def create_review(
        self, db: Session, review: schemas.ReviewCreate, client_id: int, booking_id: int
    ) -> models.Review:
        # Ensure the booking exists and belongs to the client and is in a reviewable state (e.g., COMPLETED)
        db_booking = db.query(models.Booking).filter(
            models.Booking.id == booking_id, 
            models.Booking.client_id == client_id
        ).first()
        
        if not db_booking:
            raise ValueError("Booking not found or does not belong to the client.")
        
        if db_booking.status != models.BookingStatus.COMPLETED:
            raise ValueError("Booking must be completed to leave a review.")

        # Check if a review for this booking already exists
        existing_review = self.get_reviews_by_booking(db, booking_id=booking_id)
        if existing_review:
            raise ValueError("A review for this booking already exists.")

        db_review = models.Review(
            **review.model_dump(), 
            client_id=client_id, 
            booking_id=booking_id,
            artist_id=db_booking.artist_id # Get artist_id from the booking
        )
        db.add(db_review)
        db.commit()
        db.refresh(db_review)
        return db_review

    # Update and Delete for reviews can be added if necessary.
    # def update_review(...)
    # def delete_review(...)

review = CRUDReview() 
