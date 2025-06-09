from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import logging

from .. import crud, models, schemas
from .dependencies import get_db, get_current_user, get_current_active_client, get_current_active_artist

logger = logging.getLogger(__name__)
from ..crud.crud_booking import create_booking_from_quote # Will be created later
from ..services.booking_quote import calculate_quote_breakdown, calculate_quote
from decimal import Decimal

router = APIRouter(
    tags=["Quotes"],
)

@router.post(
    "/booking-requests/{request_id}/quotes",
    response_model=schemas.QuoteResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_quote_for_request(
    request_id: int,
    quote_in: schemas.QuoteCreate,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_active_artist)
):
    """
    Create a new quote for a specific booking request.
    Only the artist to whom the request was made can create a quote.
    The `quote_in` schema's `booking_request_id` must match `request_id` from path.
    """
    if quote_in.booking_request_id != request_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Booking request ID in path does not match ID in request body."
        )
    
    db_booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not db_booking_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found")
    
    if db_booking_request.artist_id != current_artist.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create a quote for this request")

    try:
        new_quote = crud.crud_quote.create_quote(db=db, quote=quote_in, artist_id=current_artist.id)
        crud.crud_message.create_message(
            db=db,
            booking_request_id=request_id,
            sender_id=current_artist.id,
            sender_type=models.SenderType.ARTIST,
            content="Artist sent a quote",
            message_type=models.MessageType.QUOTE,
            quote_id=new_quote.id,
            attachment_url=None,
        )
        return new_quote
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/quotes/{quote_id}", response_model=schemas.QuoteResponse)
def read_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve a specific quote by ID.
    Accessible by the client of the booking request or the artist who made the quote.
    """
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

    db_quote = crud.crud_quote.get_quote(db, quote_id=quote_id)
    if db_quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    
    # Check if current user is the client of the booking request or the artist of the quote
    if not (db_quote.booking_request.client_id == current_user.id or db_quote.artist_id == current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this quote")
    return db_quote

@router.get("/booking-requests/{request_id}/quotes", response_model=List[schemas.QuoteResponse])
def read_quotes_for_booking_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve all quotes associated with a specific booking request.
    Accessible by the client who made the request or the artist it was made to.
    """
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

    db_booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not db_booking_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found")

    if not (db_booking_request.client_id == current_user.id or db_booking_request.artist_id == current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access quotes for this request")
    
    return crud.crud_quote.get_quotes_by_booking_request(db, booking_request_id=request_id)

@router.get("/quotes/me/artist", response_model=List[schemas.QuoteResponse])
def read_my_artist_quotes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_active_artist)
):
    """
    Retrieve all quotes made by the current artist.
    """
    return crud.crud_quote.get_quotes_by_artist(db=db, artist_id=current_artist.id, skip=skip, limit=limit)

@router.put("/quotes/{quote_id}/client", response_model=schemas.QuoteResponse)
def update_quote_by_client(
    quote_id: int,
    quote_update: schemas.QuoteUpdateByClient, # Client can only update status (accept/reject)
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_client)
):
    """
    Update a quote's status (accept or reject).
    Only accessible by the client to whom the quote was offered (via booking request).
    """
    db_quote = crud.crud_quote.get_quote(db, quote_id=quote_id)
    if db_quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    
    if db_quote.booking_request.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this quote")

    if db_quote.status != models.QuoteStatus.PENDING_CLIENT_ACTION:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Quote cannot be updated. Current status: {db_quote.status.value}")

    # Client can only set status to ACCEPTED_BY_CLIENT or REJECTED_BY_CLIENT
    if quote_update.status not in [models.QuoteStatus.ACCEPTED_BY_CLIENT, models.QuoteStatus.REJECTED_BY_CLIENT]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status update by client.")
    
    try:
        return crud.crud_quote.update_quote(db=db, db_quote=db_quote, quote_update=quote_update, actor_is_artist=False)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.put("/quotes/{quote_id}/artist", response_model=schemas.QuoteResponse)
def update_quote_by_artist(
    quote_id: int,
    quote_update: schemas.QuoteUpdateByArtist, # Artist can update details or withdraw
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_active_artist)
):
    """
    Update quote details or withdraw a quote.
    Only accessible by the artist who created the quote.
    """
    db_quote = crud.crud_quote.get_quote(db, quote_id=quote_id)
    if db_quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    
    if db_quote.artist_id != current_artist.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this quote")

    # Artist can withdraw a PENDING_CLIENT_ACTION quote. Or update details.
    # Cannot modify if client already acted (ACCEPTED/REJECTED) or artist already confirmed.
    if db_quote.status not in [models.QuoteStatus.PENDING_CLIENT_ACTION]:
        if not (quote_update.status == models.QuoteStatus.WITHDRAWN_BY_ARTIST and db_quote.status == models.QuoteStatus.PENDING_CLIENT_ACTION):
             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Quote cannot be modified in its current status: {db_quote.status.value}")
   
    # If updating status, artist can only withdraw (unless it's confirming an accepted quote - separate endpoint)
    if quote_update.status and quote_update.status not in [models.QuoteStatus.WITHDRAWN_BY_ARTIST]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Artist can only withdraw the quote using this endpoint for status changes.")

    try:
        return crud.crud_quote.update_quote(db=db, db_quote=db_quote, quote_update=quote_update, actor_is_artist=True)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/quotes/{quote_id}/confirm-booking", response_model=schemas.BookingResponse)
def confirm_quote_and_create_booking(
    quote_id: int,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_active_artist)
):
    """
    Artist confirms a client-accepted quote, which creates a formal Booking.
    """
    db_quote = crud.crud_quote.get_quote(db, quote_id=quote_id)
    if db_quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    if db_quote.artist_id != current_artist.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to confirm this quote")

    if db_quote.status != models.QuoteStatus.ACCEPTED_BY_CLIENT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quote must be accepted by client before artist can confirm and create booking.")

    # Update quote status to CONFIRMED_BY_ARTIST and subsequently BookingRequest to REQUEST_CONFIRMED
    quote_update_schema = schemas.QuoteUpdateByArtist(status=models.QuoteStatus.CONFIRMED_BY_ARTIST)
    try:
        updated_quote = crud.crud_quote.update_quote(
            db=db, 
            db_quote=db_quote, 
            quote_update=quote_update_schema, 
            actor_is_artist=True
        )
    except ValueError as e: # Should catch the specific error from crud if client hasn't accepted
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Now, create the actual booking
    # This part requires careful mapping from BookingRequest/Quote to BookingCreate
    # Assuming BookingRequest has service_id, proposed_datetime_1 (as start_time)
    # and Quote has price.
    booking_request = updated_quote.booking_request
    if not booking_request.service_id or not booking_request.proposed_datetime_1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking request is missing service or proposed datetime for booking creation.")
    
    # Estimate end_time based on service duration (if service_id is present)
    # This is a simplified estimation; complex scheduling might need more.
    related_service = db.query(models.Service).filter(models.Service.id == booking_request.service_id).first()
    if not related_service:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Service with ID {booking_request.service_id} not found for booking.")

    from datetime import timedelta
    end_time = booking_request.proposed_datetime_1 + timedelta(minutes=related_service.duration_minutes)

    booking_data = schemas.BookingCreate(
        artist_id=updated_quote.artist_id,
        service_id=booking_request.service_id,
        start_time=booking_request.proposed_datetime_1, 
        end_time=end_time, # Needs calculation based on service duration
        notes=f"Booking created from accepted quote ID: {updated_quote.id}. Original request message: {booking_request.message or ''}",
        # total_price will come from the quote
    )

    try:
        # The actual booking creation logic will need to exist in crud.crud_booking
        # and handle setting total_price from the quote and linking quote_id.
        new_booking = create_booking_from_quote(db=db, booking_create=booking_data, quote=updated_quote, client_id=booking_request.client_id)
        return new_booking
    except Exception as e:
        # Rollback quote status change if booking creation fails?
        # For now, log and raise. This needs careful transaction management if combined.
        # Consider that update_quote already committed the quote status change.
        # A more robust solution would use a service layer pattern with explicit transaction control.
        logger.exception("Error creating booking from quote: %s", e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create booking after quote confirmation.")


@router.post("/quotes/calculate", response_model=schemas.QuoteCalculationResponse)
def calculate_quote_endpoint(
    params: schemas.QuoteCalculationParams,
    db: Session = Depends(get_db),
):
    """Return a quick quote estimation used during booking flow."""
    provider = None
    if params.provider_id is not None:
        provider = db.query(models.SoundProvider).filter(models.SoundProvider.id == params.provider_id).first()
        if not provider:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    breakdown = calculate_quote_breakdown(
        params.base_fee, params.distance_km, provider, params.accommodation_cost
    )
    return breakdown
