from sqlalchemy.orm import Session
from typing import List, Optional, Type
from decimal import Decimal
from datetime import datetime, timedelta

from .. import models, schemas
from ..models.booking_status import BookingStatus  # For BookingStatus enum
from ..models.service import ServiceType
from . import crud_event_prep


class CRUDBooking:
    def get_booking(self, db: Session, booking_id: int) -> Optional[models.Booking]:
        return db.query(models.Booking).filter(models.Booking.id == booking_id).first()

    def get_bookings_by_client(
        self, db: Session, client_id: int, skip: int = 0, limit: int = 100
    ) -> List[Type[models.Booking]]:
        return (
            db.query(models.Booking)
            .filter(models.Booking.client_id == client_id)
            .order_by(models.Booking.start_time.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_bookings_by_artist(
        self, db: Session, artist_id: int, skip: int = 0, limit: int = 100
    ) -> List[Type[models.Booking]]:
        return (
            db.query(models.Booking)
            .filter(models.Booking.artist_id == artist_id)
            .order_by(models.Booking.start_time.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create_booking(
        self, db: Session, booking_in: schemas.BookingCreate, client_id: int
    ) -> models.Booking:
        # Get the service to determine the price
        db_service = db.query(models.Service).filter(models.Service.id == booking_in.service_id).first()
        if not db_service:
            raise ValueError(f"Service with id {booking_in.service_id} not found.")
        
        if db_service.artist_id != booking_in.artist_id:
            raise ValueError(f"Service with id {booking_in.service_id} does not belong to artist {booking_in.artist_id}.")

        total_price = db_service.price

        db_booking = models.Booking(
            **booking_in.model_dump(),
            client_id=client_id,
            total_price=total_price,
            status=BookingStatus.PENDING # Default status for new direct bookings
        )
        db.add(db_booking)
        db.commit()
        db.refresh(db_booking)
        return db_booking

    def update_booking_status(
        self, db: Session, booking_id: int, status: BookingStatus, current_user_id: int, user_is_artist: bool
    ) -> Optional[models.Booking]:
        db_booking = self.get_booking(db, booking_id=booking_id)
        if not db_booking:
            return None

        # Authorization: Only client or artist related to the booking can update status
        if not (db_booking.client_id == current_user_id or (user_is_artist and db_booking.artist_id == current_user_id)):
             # Or admin check if you have admin roles
            raise PermissionError("Not authorized to update this booking's status.")

        # Add logic here if certain status transitions are not allowed or depend on user role
        # For example, only an artist can confirm a PENDING booking.
        # Only a client can cancel a PENDING booking.

        db_booking.status = status
        db.commit()
        db.refresh(db_booking)
        return db_booking
    
    def update_booking(
        self, db: Session, db_booking: models.Booking, booking_in: schemas.BookingUpdate
    ) -> models.Booking:
        update_data = booking_in.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_booking, key, value)
        db.commit()
        db.refresh(db_booking)
        return db_booking

    def delete_booking(self, db: Session, booking_id: int, current_user_id: int) -> Optional[models.Booking]:
        db_booking = self.get_booking(db, booking_id=booking_id)
        if not db_booking:
            return None
        
        # Authorization: Only client who made booking can delete (if status is PENDING for example)
        if db_booking.client_id != current_user_id:
            raise PermissionError("Not authorized to delete this booking.")
        
        # Potentially add status check, e.g., only allow deletion if PENDING
        # if db_booking.status != BookingStatus.PENDING:
        #     raise ValueError("Booking can only be deleted if it is in PENDING status.")

        db.delete(db_booking)
        db.commit()
        return db_booking

booking = CRUDBooking()

def _is_venue_service(service: models.Service) -> bool:
    """Return True when the service category represents a venue."""
    try:
        cat = getattr(service, "service_category", None)
        name = (getattr(cat, "name", None) or "").strip().lower()
    except Exception:
        name = ""
    return name in ("wedding venue", "venue")

# Function to create a booking from a QuoteV2 after it is accepted
def create_booking_from_quote_v2(db: Session, quote: models.QuoteV2) -> models.Booking:
    """Create a ``Booking`` record from an accepted ``QuoteV2``."""

    booking_request = quote.booking_request
    if booking_request is None:
        raise ValueError("Quote is missing booking_request relationship")

    if not booking_request.service_id:
        raise ValueError("Booking request lacks service_id")

    service = db.query(models.Service).filter(models.Service.id == booking_request.service_id).first()
    if service is None:
        raise ValueError(f"Service id {booking_request.service_id} not found")

    if (
        (service.service_type == ServiceType.LIVE_PERFORMANCE or _is_venue_service(service))
        and not booking_request.proposed_datetime_1
    ):
        raise ValueError("Booking request lacks proposed_datetime_1")

    start_time = booking_request.proposed_datetime_1 or datetime.utcnow()

    end_time = start_time + timedelta(minutes=service.duration_minutes)
    db_booking = models.Booking(
        artist_id=quote.artist_id,
        client_id=quote.client_id,
        service_id=service.id,
        start_time=start_time,
        end_time=end_time,
        status=models.BookingStatus.CONFIRMED,
        total_price=quote.total,
        quote_id=quote.id,
    )
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    # Bootstrap event prep row for this booking (idempotent)
    try:
        from . import crud_event_prep
        crud_event_prep.seed_for_booking(db, db_booking)
    except Exception:
        pass
    return db_booking
