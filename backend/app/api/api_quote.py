from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
import logging
from datetime import datetime, timedelta

from .. import crud, models, schemas
from .dependencies import (
    get_db,
    get_current_user,
    get_current_active_client,
    get_current_service_provider,
)

logger = logging.getLogger(__name__)
from ..crud.crud_booking import (
    create_booking_from_quote,
)  # Will be created later
from ..services.booking_quote import calculate_quote_breakdown, calculate_quote
from decimal import Decimal
from ..utils import error_response
from ..utils.notifications import notify_user_new_message

router = APIRouter(
    tags=["Quotes"],
)


@router.post(
    "/booking-requests/{request_id}/quotes",
    response_model=schemas.QuoteResponse,
    status_code=status.HTTP_201_CREATED,
    response_model_exclude_none=True,
)
def create_quote_for_request(
    request_id: int,
    quote_in: schemas.QuoteCreate,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_service_provider),
):
    """
    Create a new quote for a specific booking request.
    Only the artist to whom the request was made can create a quote.
    The `quote_in` schema's `booking_request_id` must match `request_id` from path.
    """
    if quote_in.booking_request_id != request_id:
        logger.warning(
            "Quote create mismatch; user_id=%s path=%s body=%s",
            current_artist.id,
            f"/booking-requests/{request_id}/quotes",
            quote_in.model_dump(),
        )
        raise error_response(
            "Booking request ID in path does not match ID in request body.",
            {"booking_request_id": "Mismatch"},
            status.HTTP_400_BAD_REQUEST,
        )

    db_booking_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not db_booking_request:
        logger.warning(
            "Booking request %s not found for quote creation; user_id=%s",
            request_id,
            current_artist.id,
        )
        raise error_response(
            "Booking request not found",
            {"booking_request_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )

    if db_booking_request.artist_id != current_artist.id:
        logger.warning(
            "Unauthorized quote creation attempt; user_id=%s request_id=%s",
            current_artist.id,
            request_id,
        )
        raise error_response(
            "Not authorized to create a quote for this request",
            {"request_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )

    try:
        new_quote = crud.crud_quote.create_quote(
            db=db, quote=quote_in, artist_id=current_artist.id
        )
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
        # Prompt the client to review and accept the quote. The system message
        # is visible only to the client and includes an expiration timestamp so
        # the frontend can display a countdown.
        expires_at = datetime.utcnow() + timedelta(days=7)
        crud.crud_message.create_message(
            db=db,
            booking_request_id=request_id,
            sender_id=current_artist.id,
            sender_type=models.SenderType.ARTIST,
            content="Review & Accept Quote",
            message_type=models.MessageType.SYSTEM,
            visible_to=models.VisibleTo.CLIENT,
            action=models.MessageAction.REVIEW_QUOTE,
            quote_id=new_quote.id,
            attachment_url=None,
            expires_at=expires_at,
        )
        client = (
            db.query(models.User)
            .filter(models.User.id == db_booking_request.client_id)
            .first()
        )
        artist = (
            db.query(models.User).filter(models.User.id == current_artist.id).first()
        )
        if client and artist:
            notify_user_new_message(
                db,
                client,
                artist,
                request_id,
                "Artist sent a quote",
                models.MessageType.QUOTE,
            )
        # Avoid circular references when serialized by Pydantic models
        new_quote.booking_request = None
        return new_quote
    except ValueError as e:
        logger.warning(
            "Invalid quote create payload by user %s: %s", current_artist.id, e
        )
        raise error_response(str(e), {"quote": str(e)}, status.HTTP_400_BAD_REQUEST)


@router.get(
    "/quotes/{quote_id}",
    response_model=schemas.QuoteResponse,
    response_model_exclude_none=True,
)
def read_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Retrieve a specific quote by ID.
    Accessible by the client of the booking request or the artist who made the quote.
    """
    if not current_user.is_active:
        raise error_response(
            "Inactive user",
            {"user": "Inactive"},
            status.HTTP_400_BAD_REQUEST,
        )

    db_quote = crud.crud_quote.get_quote(db, quote_id=quote_id)
    if db_quote is None:
        raise error_response(
            f"Quote with id {quote_id} not found",
            {"quote_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )

    # Check if current user is the client of the booking request or the artist of the quote
    if not (
        db_quote.booking_request.client_id == current_user.id
        or db_quote.artist_id == current_user.id
    ):
        raise error_response(
            "Not authorized to access this quote",
            {"quote_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )
    db_quote.booking_request = None
    return db_quote


@router.get(
    "/booking-requests/{request_id}/quotes",
    response_model=List[schemas.QuoteResponse],
    response_model_exclude_none=True,
)
def read_quotes_for_booking_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Retrieve all quotes associated with a specific booking request.
    Accessible by the client who made the request or the artist it was made to.
    """
    if not current_user.is_active:
        raise error_response(
            "Inactive user",
            {"user": "Inactive"},
            status.HTTP_400_BAD_REQUEST,
        )

    db_booking_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not db_booking_request:
        raise error_response(
            "Booking request not found",
            {"booking_request_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )

    if not (
        db_booking_request.client_id == current_user.id
        or db_booking_request.artist_id == current_user.id
    ):
        raise error_response(
            "Not authorized to access quotes for this request",
            {"request_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )
    quotes = crud.crud_quote.get_quotes_by_booking_request(
        db, booking_request_id=request_id
    )
    for q in quotes:
        q.booking_request = None
    return quotes


@router.get(
    "/quotes/me/artist",
    response_model=List[schemas.QuoteResponse],
    response_model_exclude_none=True,
)
def read_my_artist_quotes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_service_provider),
):
    """
    Retrieve all quotes made by the current artist.
    """
    quotes = crud.crud_quote.get_quotes_by_artist(
        db=db, artist_id=current_artist.id, skip=skip, limit=limit
    )
    for q in quotes:
        q.booking_request = None
    return quotes


@router.put(
    "/quotes/{quote_id}/client",
    response_model=schemas.QuoteResponse,
    response_model_exclude_none=True,
)
def update_quote_by_client(
    quote_id: int,
    quote_update: schemas.QuoteUpdateByClient,  # Client can only update status (accept/reject)
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_client),
):
    """
    Update a quote's status (accept or reject).
    Only accessible by the client to whom the quote was offered (via booking request).
    """
    db_quote = crud.crud_quote.get_quote(db, quote_id=quote_id)
    if db_quote is None:
        raise error_response(
            "Quote not found",
            {"quote_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )

    if db_quote.booking_request.client_id != current_user.id:
        raise error_response(
            "Not authorized to update this quote",
            {"quote_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )

    if db_quote.status != models.QuoteStatus.PENDING_CLIENT_ACTION:
        raise error_response(
            f"Quote cannot be updated. Current status: {db_quote.status.value}",
            {"status": "Invalid state"},
            status.HTTP_400_BAD_REQUEST,
        )

    # Client can only set status to ACCEPTED_BY_CLIENT or REJECTED_BY_CLIENT
    if quote_update.status not in [
        models.QuoteStatus.ACCEPTED_BY_CLIENT,
        models.QuoteStatus.REJECTED_BY_CLIENT,
    ]:
        raise error_response(
            "Invalid status update by client.",
            {"status": "Not allowed"},
            status.HTTP_400_BAD_REQUEST,
        )

    try:
        return crud.crud_quote.update_quote(
            db=db,
            db_quote=db_quote,
            quote_update=quote_update,
            actor_is_artist=False,
        )
    except ValueError as e:
        raise error_response(str(e), {"quote": str(e)}, status.HTTP_400_BAD_REQUEST)


@router.put(
    "/quotes/{quote_id}/artist",
    response_model=schemas.QuoteResponse,
    response_model_exclude_none=True,
)
def update_quote_by_artist(
    quote_id: int,
    quote_update: schemas.QuoteUpdateByArtist,  # Artist can update details or withdraw
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_service_provider),
):
    """
    Update quote details or withdraw a quote.
    Only accessible by the artist who created the quote.
    """
    db_quote = crud.crud_quote.get_quote(db, quote_id=quote_id)
    if db_quote is None:
        raise error_response(
            "Quote not found",
            {"quote_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )

    if db_quote.artist_id != current_artist.id:
        raise error_response(
            "Not authorized to update this quote",
            {"quote_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )

    # Artist can withdraw a PENDING_CLIENT_ACTION quote. Or update details.
    # Cannot modify if client already acted (ACCEPTED/REJECTED) or artist already confirmed.
    if db_quote.status not in [models.QuoteStatus.PENDING_CLIENT_ACTION]:
        if not (
            quote_update.status == models.QuoteStatus.WITHDRAWN_BY_ARTIST
            and db_quote.status == models.QuoteStatus.PENDING_CLIENT_ACTION
        ):
            raise error_response(
                f"Quote cannot be modified in its current status: {db_quote.status.value}",
                {"status": "Invalid state"},
                status.HTTP_400_BAD_REQUEST,
            )

    # If updating status, artist can only withdraw (unless it's confirming an accepted quote - separate endpoint)
    if quote_update.status and quote_update.status not in [
        models.QuoteStatus.WITHDRAWN_BY_ARTIST
    ]:
        raise error_response(
            "Artist can only withdraw the quote using this endpoint for status changes.",
            {"status": "Not allowed"},
            status.HTTP_400_BAD_REQUEST,
        )

    try:
        return crud.crud_quote.update_quote(
            db=db,
            db_quote=db_quote,
            quote_update=quote_update,
            actor_is_artist=True,
        )
    except ValueError as e:
        raise error_response(str(e), {"quote": str(e)}, status.HTTP_400_BAD_REQUEST)


@router.post(
    "/quotes/{quote_id}/confirm-booking",
    response_model=schemas.BookingResponse,
    response_model_exclude_none=True,
)
def confirm_quote_and_create_booking(
    quote_id: int,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_service_provider),
):
    """
    Artist confirms a client-accepted quote, which creates a formal Booking.
    """
    db_quote = crud.crud_quote.get_quote(db, quote_id=quote_id)
    if db_quote is None:
        raise error_response(
            "Quote not found",
            {"quote_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )

    if db_quote.artist_id != current_artist.id:
        raise error_response(
            (
                f"Artist id {current_artist.id} is not authorized to confirm quote"
                f" {quote_id}"
            ),
            {"quote_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )

    if db_quote.status != models.QuoteStatus.ACCEPTED_BY_CLIENT:
        raise error_response(
            (
                f"Quote {quote_id} status is {db_quote.status.value}; "
                "only accepted quotes can be confirmed"
            ),
            {"status": "Invalid state"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    # Update quote status to CONFIRMED_BY_ARTIST and subsequently BookingRequest to REQUEST_CONFIRMED
    quote_update_schema = schemas.QuoteUpdateByArtist(
        status=models.QuoteStatus.CONFIRMED_BY_ARTIST
    )
    try:
        updated_quote = crud.crud_quote.update_quote(
            db=db,
            db_quote=db_quote,
            quote_update=quote_update_schema,
            actor_is_artist=True,
        )
    except (
        ValueError,
    ) as e:  # Should catch the specific error from crud if client hasn't accepted
        raise error_response(
            f"Could not update quote {quote_id}: {e}",
            {"quote_id": str(e)},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    # Now, create the actual booking
    # This part requires careful mapping from BookingRequest/Quote to BookingCreate
    # Assuming BookingRequest has service_id, proposed_datetime_1 (as start_time)
    # and Quote has price.
    booking_request = updated_quote.booking_request
    if not booking_request.service_id or not booking_request.proposed_datetime_1:
        raise error_response(
            "Booking request lacks service_id or proposed_datetime_1; cannot create booking",
            {"booking_request": "Incomplete"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    # Estimate end_time based on service duration (if service_id is present)
    # This is a simplified estimation; complex scheduling might need more.
    related_service = (
        db.query(models.Service)
        .filter(models.Service.id == booking_request.service_id)
        .first()
    )
    if not related_service:
        raise error_response(
            (
                f"Service with id {booking_request.service_id} not found when "
                "creating booking"
            ),
            {"service_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )

    from datetime import timedelta

    end_time = booking_request.proposed_datetime_1 + timedelta(
        minutes=related_service.duration_minutes
    )

    booking_data = schemas.BookingCreate(
        artist_id=updated_quote.artist_id,
        service_id=booking_request.service_id,
        start_time=booking_request.proposed_datetime_1,
        end_time=end_time,  # Needs calculation based on service duration
        notes=f"Booking created from accepted quote ID: {updated_quote.id}. Original request message: {booking_request.message or ''}",
        # total_price will come from the quote
    )

    try:
        # The actual booking creation logic will need to exist in crud.crud_booking
        # and handle setting total_price from the quote and linking quote_id.
        new_booking = create_booking_from_quote(
            db=db,
            booking_create=booking_data,
            quote=updated_quote,
            client_id=booking_request.client_id,
        )
        return new_booking
    except ValueError as e:
        logger.error("Failed booking creation from quote %s: %s", quote_id, e)
        raise error_response(
            f"Unable to create booking from quote {quote_id}: {e}",
            {"quote_id": str(e)},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    except Exception as e:
        logger.exception("Error creating booking from quote %s: %s", quote_id, e)
        raise error_response(
            f"Failed to create booking from quote {quote_id}",
            {"quote_id": "server_error"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post(
    "/quotes/calculate",
    response_model=schemas.QuoteCalculationResponse,
    response_model_exclude_none=True,
)
def calculate_quote_endpoint(
    params: schemas.QuoteCalculationParams,
    db: Session = Depends(get_db),
):
    """Return a quick quote estimation used during booking flow."""
    service = crud.service.get_service(db, params.service_id)
    if not service:
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    breakdown = calculate_quote_breakdown(
        params.base_fee,
        params.distance_km,
        params.accommodation_cost,
        service=service,
        event_city=params.event_city,
        db=db,
    )
    return breakdown
