from sqlalchemy.orm import Session
from typing import List, Optional, Type
from decimal import Decimal

from .. import models, schemas
from ..models.booking import BookingStatus # For BookingStatus enum


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

# Function to create a booking from an accepted and confirmed quote
def create_booking_from_quote(
    db: Session, 
    booking_create: schemas.BookingCreate, # Contains artist_id, service_id, start_time, end_time, notes
    quote: models.Quote, 
    client_id: int
) -> models.Booking:
    """
    Creates a new Booking record from a confirmed quote.
    The total_price is taken from the quote.
    The booking status is set to CONFIRMED.
    """
    # Ensure the service exists and belongs to the specified artist
    db_service = db.query(models.Service).filter(
        models.Service.id == booking_create.service_id,
        models.Service.artist_id == booking_create.artist_id 
    ).first()
    if not db_service:
        raise ValueError(f"Service id {booking_create.service_id} not found for artist id {booking_create.artist_id}")

    db_booking = models.Booking(
        artist_id=booking_create.artist_id,
        client_id=client_id,
        service_id=booking_create.service_id,
        start_time=booking_create.start_time,
        end_time=booking_create.end_time,
        status=models.BookingStatus.CONFIRMED, # Quote confirmed, so booking is confirmed
        total_price=quote.price, # Price from the confirmed quote
        notes=booking_create.notes,
        quote_id=quote.id # Link to the source quote
    )
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    return db_booking 