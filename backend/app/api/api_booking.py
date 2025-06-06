# backend/app/api/v1/api_booking.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from typing import List, Any
from decimal import Decimal

from ..database import get_db
from ..models.user import User, UserType
from ..models.artist_profile_v2 import ArtistProfileV2 as ArtistProfile
from ..models.service import Service
from ..models.booking import Booking, BookingStatus
from ..schemas.booking import BookingCreate, BookingUpdate, BookingResponse
from .dependencies import (
    get_current_user,
    get_current_active_client,
    get_current_active_artist,
)

router = APIRouter(tags=["bookings"])
# ‣ Note: no prefix here.  main.py already does:
#     app.include_router(router, prefix="/api/v1/bookings", …)

@router.post("/", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(
    *,
    db: Session = Depends(get_db),
    booking_in: BookingCreate,
    current_client: User = Depends(get_current_active_client),
) -> Any:
    """
    Create a new booking.  Only authenticated clients may book services from artists.
    """
    # 1) Verify that the artist exists
    artist_profile = (
        db.query(ArtistProfile)
        .filter(ArtistProfile.user_id == booking_in.artist_id)
        .first()
    )
    if not artist_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found."
        )

    # 2) Verify that the requested service belongs to that artist
    service = (
        db.query(Service)
        .filter(
            Service.id == booking_in.service_id,
            Service.artist_id == booking_in.artist_id,
        )
        .first()
    )
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found for this artist.",
        )

    # 3) Basic validation: start_time < end_time
    if booking_in.start_time >= booking_in.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking start_time must be before end_time.",
        )

    # 4) Calculate total_price (here we simply use service.price; adapt as needed)
    total_price = service.price

    db_booking = Booking(
        client_id=current_client.id,
        artist_id=booking_in.artist_id,
        service_id=booking_in.service_id,
        start_time=booking_in.start_time,
        end_time=booking_in.end_time,
        status=BookingStatus.PENDING,
        total_price=Decimal(str(total_price)),
        notes=booking_in.notes,
    )

    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)

    # Re‐load with relationships for the response model (if BookingResponse expects nested fields)
    reloaded = (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
        )
        .filter(Booking.id == db_booking.id)
        .first()
    )
    return reloaded


@router.get("/my-bookings", response_model=List[BookingResponse])
def read_my_bookings(
    *,
    db: Session = Depends(get_db),
    current_client: User = Depends(get_current_active_client),
) -> Any:
    """
    Return all bookings made by the currently authenticated client.
    """
    bookings = (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
        )
        .filter(Booking.client_id == current_client.id)
        .order_by(Booking.start_time.desc())
        .all()
    )
    return bookings


@router.get("/artist-bookings", response_model=List[BookingResponse])
def read_artist_bookings(
    *,
    db: Session = Depends(get_db),
    current_artist: User = Depends(get_current_active_artist),
) -> Any:
    """
    Return all bookings for the currently authenticated artist.
    """
    bookings = (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
        )
        .filter(Booking.artist_id == current_artist.id)
        .order_by(Booking.start_time.desc())
        .all()
    )
    return bookings


@router.patch("/{booking_id}/status", response_model=BookingResponse)
def update_booking_status(
    *,
    db: Session = Depends(get_db),
    booking_id: int,
    status_update: BookingUpdate,  # Only contains a `status: BookingStatus` field
    current_artist: User = Depends(get_current_active_artist),
) -> Any:
    """
    Update the status of a booking.  Only the artist who owns that booking may call this.
    """
    booking = (
        db.query(Booking)
        .filter(
            Booking.id == booking_id,
            Booking.artist_id == current_artist.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found or you lack permission to update it.",
        )

    if status_update.status is not None:
        booking.status = status_update.status

    db.add(booking)
    db.commit()

    reloaded = (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
        )
        .filter(Booking.id == booking.id)
        .first()
    )
    return reloaded


@router.get("/{booking_id}", response_model=BookingResponse)
def read_booking_details(
    *,
    db: Session = Depends(get_db),
    booking_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Return the details of a single booking.  
    Accessible if the current user is either the booking’s client or the booking’s artist.
    """
    booking = (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
        )
        .filter(Booking.id == booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found."
        )

    # Only the client or the artist may see it:
    if not (
        booking.client_id == current_user.id
        or (
            current_user.user_type == UserType.ARTIST
            and booking.artist_id == current_user.id
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this booking.",
        )

    return booking
