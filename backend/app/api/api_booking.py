# backend/app/api/v1/api_booking.py

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload
from fastapi.responses import Response
from ics import Calendar, Event
from typing import List, Any
from decimal import Decimal

from ..database import get_db
from ..models.user import User, UserType
from ..models.service_provider_profile import ServiceProviderProfile
from ..models.service import Service
from ..models import Booking, BookingStatus
from ..models.booking_simple import BookingSimple
from ..models.quote_v2 import QuoteV2
from ..schemas.booking import BookingCreate, BookingUpdate, BookingResponse
from .dependencies import (
    get_current_user,
    get_current_active_client,
    get_current_service_provider,
)
from ..utils.redis_cache import invalidate_availability_cache

router = APIRouter(tags=["bookings"])
logger = logging.getLogger(__name__)
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
        db.query(ServiceProviderProfile)
        .filter(ServiceProviderProfile.user_id == booking_in.artist_id)
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

    invalidate_availability_cache(booking_in.artist_id)

    # Re‐load with relationships for the response model (if BookingResponse expects nested fields)
    reloaded = (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
            selectinload(Booking.source_quote),
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
    status_filter: str | None = Query(
        None,
        alias="status",
        description="Filter by status or 'upcoming'/'past'",
        examples={
            "upcoming": {"summary": "Upcoming", "value": "upcoming"},
            "past": {"summary": "Past", "value": "past"},
        },
    ),
) -> Any:
    """Return bookings for the authenticated client, optionally filtered."""
    query = (
        db.query(
            Booking,
            BookingSimple.deposit_due_by,
            BookingSimple.deposit_amount,
            BookingSimple.payment_status,
            BookingSimple.deposit_paid,
            QuoteV2.booking_request_id,
        )
        .outerjoin(BookingSimple, BookingSimple.quote_id == Booking.quote_id)
        .outerjoin(QuoteV2, BookingSimple.quote_id == QuoteV2.id)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
            selectinload(Booking.source_quote),
        )
        .filter(Booking.client_id == current_client.id)
    )

    if status_filter:
        try:
            if status_filter == "upcoming":
                query = query.filter(
                    Booking.status.in_(
                        [BookingStatus.PENDING, BookingStatus.CONFIRMED]
                    )
                )
            elif status_filter == "past":
                query = query.filter(
                    Booking.status.in_(
                        [BookingStatus.COMPLETED, BookingStatus.CANCELLED]
                    )
                )
            else:
                enum_status = BookingStatus(status_filter)
                query = query.filter(Booking.status == enum_status)
        except ValueError as exc:  # invalid status string
            logger.warning("Invalid status filter: %s", status_filter)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid status filter",
            ) from exc

    rows = query.order_by(Booking.start_time.desc()).all()
    bookings: List[Booking] = []
    for (
        booking,
        deposit_due,
        deposit_amount,
        payment_status,
        deposit_paid,
        booking_request_id,
    ) in rows:
        has_simple = deposit_paid is not None

        booking.deposit_due_by = deposit_due if has_simple else None
        booking.payment_status = payment_status if has_simple else None
        booking.deposit_paid = deposit_paid if has_simple else None

        if deposit_amount is None:
            booking.deposit_amount = Decimal("0")
        else:
            booking.deposit_amount = deposit_amount

        if booking_request_id is not None:
            booking.booking_request_id = booking_request_id
        bookings.append(booking)

    return bookings


@router.get("/artist-bookings", response_model=List[BookingResponse])
def read_artist_bookings(
    *,
    db: Session = Depends(get_db),
    current_artist: User = Depends(get_current_service_provider),
) -> Any:
    """
    Return all bookings for the currently authenticated artist.
    """
    bookings = (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
            selectinload(Booking.source_quote),
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
    current_artist: User = Depends(get_current_service_provider),
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

    prev_status = booking.status
    if status_update.status is not None:
        booking.status = status_update.status

    db.add(booking)
    db.commit()
    invalidate_availability_cache(booking.artist_id)

    reloaded = (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
            selectinload(Booking.source_quote),
        )
        .filter(Booking.id == booking.id)
        .first()
    )

    if (
        prev_status != BookingStatus.COMPLETED
        and booking.status == BookingStatus.COMPLETED
    ):
        from ..utils.notifications import notify_review_request

        notify_review_request(db, booking.client, booking.id)
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
    booking_row = (
        db.query(
            Booking,
            BookingSimple.deposit_due_by,
            BookingSimple.deposit_amount,
            BookingSimple.payment_status,
            BookingSimple.deposit_paid,
            QuoteV2.booking_request_id,
        )
        .outerjoin(BookingSimple, BookingSimple.quote_id == Booking.quote_id)
        .outerjoin(QuoteV2, BookingSimple.quote_id == QuoteV2.id)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
            selectinload(Booking.source_quote),
        )
        .filter(Booking.id == booking_id)
        .first()
    )
    if not booking_row:
        logger.warning(
            "Booking %s not found for user %s",
            booking_id,
            getattr(current_user, "id", "anonymous"),
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booking with id {booking_id} not found.",
        )

    (
        booking,
        deposit_due,
        deposit_amount,
        payment_status,
        deposit_paid,
        booking_request_id,
    ) = booking_row

    # Only the client or the artist may see it:
    if not (
        booking.client_id == current_user.id
        or (
            current_user.user_type == UserType.SERVICE_PROVIDER
            and booking.artist_id == current_user.id
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this booking.",
        )

    has_simple = deposit_paid is not None

    booking.deposit_due_by = deposit_due if has_simple else None
    booking.payment_status = payment_status if has_simple else None
    booking.deposit_paid = deposit_paid if has_simple else None

    if deposit_amount is None:
        booking.deposit_amount = Decimal("0")
    else:
        booking.deposit_amount = deposit_amount

    if booking_request_id is not None:
        booking.booking_request_id = booking_request_id

    return booking


@router.get("/{booking_id}/calendar.ics")
def download_booking_calendar(
    *,
    db: Session = Depends(get_db),
    booking_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """Return an ICS file for a confirmed booking."""

    booking = (
        db.query(Booking)
        .options(selectinload(Booking.service))
        .filter(Booking.id == booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    if not (
        booking.client_id == current_user.id
        or (
            current_user.user_type == UserType.SERVICE_PROVIDER and booking.artist_id == current_user.id
        )
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not confirmed")

    calendar = Calendar()
    event = Event()
    event.name = booking.service.title
    event.begin = booking.start_time
    event.end = booking.end_time
    calendar.events.add(event)
    ics = calendar.serialize()

    headers = {"Content-Disposition": f"attachment; filename=booking-{booking_id}.ics"}
    return Response(ics, media_type="text/calendar", headers=headers)
