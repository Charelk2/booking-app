from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models
from .. import schemas

# --- Quote CRUD --- QUOTE

def create_quote(
    db: Session, 
    quote: schemas.QuoteCreate, 
    artist_id: int
) -> models.Quote:
    booking_request = db.query(models.BookingRequest).filter(
        models.BookingRequest.id == quote.booking_request_id,
        models.BookingRequest.artist_id == artist_id
    ).first()

    if not booking_request:
        raise ValueError("Booking request not found or not assigned to this artist.")
    
    # Artist can provide a quote if request is pending their quote, or if client rejected a previous quote.
    if booking_request.status not in [
        models.BookingStatus.PENDING_QUOTE,
        models.BookingStatus.QUOTE_REJECTED
    ]:
        raise ValueError(f"Booking request is not in a quotable state (current status: {booking_request.status.value})")

    db_quote = models.Quote(
        **quote.model_dump(), 
        artist_id=artist_id,
        status=models.QuoteStatus.PENDING_CLIENT_ACTION
    )
    db.add(db_quote)
    
    booking_request.status = models.BookingStatus.QUOTE_PROVIDED
    db.add(booking_request)
    
    db.commit()
    db.refresh(db_quote)
    db.refresh(booking_request)
    return db_quote

def get_quote(db: Session, quote_id: int) -> Optional[models.Quote]:
    return db.query(models.Quote).filter(models.Quote.id == quote_id).first()

def get_quotes_by_booking_request(db: Session, booking_request_id: int) -> List[models.Quote]:
    return db.query(models.Quote).filter(models.Quote.booking_request_id == booking_request_id).all()

def get_quotes_by_artist(db: Session, artist_id: int, skip: int = 0, limit: int = 100) -> List[models.Quote]:
    return (
        db.query(models.Quote)
        .filter(models.Quote.artist_id == artist_id)
        .order_by(models.Quote.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

# Quotes submitted to a client are typically associated with a booking_request.
# A client would view quotes via a specific booking_request_id.
# def get_quotes_for_client_request(db: Session, booking_request_id: int, client_id: int) -> List[models.Quote]:
#     # Ensure client owns the booking_request first
#     booking_request = db.query(models.BookingRequest).filter(
#         models.BookingRequest.id == booking_request_id,
#         models.BookingRequest.client_id == client_id
#     ).first()
#     if not booking_request:
#         return [] # Or raise HTTPException
#     return booking_request.quotes

def update_quote(
    db: Session, 
    db_quote: models.Quote,
    quote_update: schemas.QuoteUpdateByArtist | schemas.QuoteUpdateByClient,
    actor_is_artist: bool # True if artist is updating, False if client is updating
) -> models.Quote:
    update_data = quote_update.model_dump(exclude_unset=True)
    original_quote_status = db_quote.status

    for key, value in update_data.items():
        setattr(db_quote, key, value)
    
    new_quote_status = db_quote.status

    # Fetch booking_request if not already loaded (though it should be via relationship)
    booking_request = db_quote.booking_request
    if not booking_request: # Should ideally not happen if relationships are set up correctly
        booking_request = db.query(models.BookingRequest).get(db_quote.booking_request_id)
        if not booking_request:
            # This case should be extremely rare, means inconsistent DB or orphaned quote.
            # Commit the quote changes and return, as we can't update a non-existent request.
            db.commit()
            db.refresh(db_quote)
            # Potentially log a warning here
            return db_quote

    # Only proceed with booking_request status changes if the quote status actually changed.
    if original_quote_status != new_quote_status:
        if not actor_is_artist: # Client is acting
            if new_quote_status == models.QuoteStatus.ACCEPTED_BY_CLIENT:
                booking_request.status = models.BookingStatus.PENDING_ARTIST_CONFIRMATION
            elif new_quote_status == models.QuoteStatus.REJECTED_BY_CLIENT:
                booking_request.status = models.BookingStatus.QUOTE_REJECTED
        else: # Artist is acting
            if new_quote_status == models.QuoteStatus.WITHDRAWN_BY_ARTIST:
                # Artist withdraws quote, request goes back to awaiting quote, 
                # unless client already accepted/rejected it or artist already confirmed it.
                if booking_request.status in [models.BookingStatus.QUOTE_PROVIDED, models.BookingStatus.PENDING_ARTIST_CONFIRMATION]:
                    booking_request.status = models.BookingStatus.PENDING_QUOTE
            elif new_quote_status == models.QuoteStatus.CONFIRMED_BY_ARTIST:
                # Artist confirms a quote that client has ALREADY accepted.
                if original_quote_status == models.QuoteStatus.ACCEPTED_BY_CLIENT:
                    booking_request.status = models.BookingStatus.REQUEST_CONFIRMED
                    # Placeholder for creating the actual Booking object
                    # create_actual_booking_from_quote(db, db_quote, booking_request)
                else:
                    # Artist cannot confirm a quote that client hasn't accepted.
                    # Revert quote status change and raise error.
                    setattr(db_quote, 'status', original_quote_status)
                    db.rollback() # Rollback any uncommitted changes including the faulty quote status update
                    raise ValueError("Quote must be accepted by client before artist can confirm.")
            # Potentially handle QuoteStatus.EXPIRED by artist if that's a manual action

        db.add(booking_request) # Add booking_request to session to save its status change

    db.commit()
    db.refresh(db_quote)
    if booking_request: # pragma: no cover (refresh if it was fetched/modified)
        db.refresh(booking_request)
    return db_quote

# Placeholder for the function that would create a Booking from a confirmed Quote
# def create_actual_booking_from_quote(db: Session, quote: models.Quote, booking_request: models.BookingRequest):
#     # Logic to create models.Booking instance
#     # Ensure service details, times are derived correctly from quote/request
#     pass 
