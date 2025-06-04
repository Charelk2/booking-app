from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import crud, models, schemas
from .dependencies import get_db, get_current_user, get_current_active_client, get_current_active_artist
from ..utils.notifications import notify_user_new_booking_request

# Prefix is added when this router is included in `app/main.py`.
router = APIRouter(
    tags=["Booking Requests"],
)

@router.post("/", response_model=schemas.BookingRequestResponse)
def create_booking_request(
    request_in: schemas.BookingRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_client) # Changed to active client
):
    """
    Create a new booking request.
    A client makes a request to an artist.
    """
    # Ensure the artist exists
    artist_user = db.query(models.User).filter(models.User.id == request_in.artist_id, models.User.user_type == models.UserType.ARTIST).first()
    if not artist_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    
    # Ensure service_id, if provided, belongs to the specified artist_id
    if request_in.service_id:
        service = db.query(models.Service).filter(
            models.Service.id == request_in.service_id,
            models.Service.artist_id == request_in.artist_id # artist_id on service is artist_profiles.user_id
        ).first()
        if not service:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service ID does not match the specified artist or does not exist.")

    new_request = crud.crud_booking_request.create_booking_request(
        db=db, booking_request=request_in, client_id=current_user.id
    )
    if request_in.message:
        crud.crud_message.create_message(
            db=db,
            booking_request_id=new_request.id,
            sender_id=current_user.id,
            sender_type=models.SenderType.CLIENT,
            content=request_in.message,
            message_type=models.MessageType.TEXT,
        )
    crud.crud_message.create_message(
        db=db,
        booking_request_id=new_request.id,
        sender_id=current_user.id,
        sender_type=models.SenderType.CLIENT,
        content="Booking request sent",
        message_type=models.MessageType.SYSTEM,
    )
    notify_user_new_booking_request(artist_user, new_request.id)
    return new_request

@router.get("/me/client", response_model=List[schemas.BookingRequestResponse])
def read_my_client_booking_requests(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_client) # Changed to active client
):
    """
    Retrieve booking requests made by the current client.
    """
    return crud.crud_booking_request.get_booking_requests_by_client(
        db=db, client_id=current_user.id, skip=skip, limit=limit
    )

@router.get("/me/artist", response_model=List[schemas.BookingRequestResponse])
def read_my_artist_booking_requests(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_active_artist) # Artist specific endpoint
):
    """
    Retrieve booking requests made to the current artist.
    """
    return crud.crud_booking_request.get_booking_requests_by_artist(
        db=db, artist_id=current_artist.id, skip=skip, limit=limit
    )

@router.get("/{request_id}", response_model=schemas.BookingRequestResponse)
def read_booking_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user) # Changed to get_current_user
):
    """
    Retrieve a specific booking request by its ID.
    Accessible by the client who made it or the artist it was made to.
    """
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    db_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if db_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found")
    if not (db_request.client_id == current_user.id or db_request.artist_id == current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this request")
    return db_request

@router.put("/{request_id}/client", response_model=schemas.BookingRequestResponse)
def update_booking_request_by_client(
    request_id: int,
    request_update: schemas.BookingRequestUpdateByClient,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_client) # Changed to active client
):
    """
    Update a booking request (e.g., message, proposed times) or withdraw it.
    Only accessible by the client who created the request.
    """
    db_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if db_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found")
    if db_request.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this request")
    
    # Prevent updating if artist has already provided a quote or declined
    if db_request.status not in [models.BookingRequestStatus.PENDING_QUOTE, models.BookingRequestStatus.REQUEST_WITHDRAWN]:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot update request in status: {db_request.status.value}")

    # Validate status change if present
    if request_update.status and request_update.status not in [models.BookingRequestStatus.REQUEST_WITHDRAWN, models.BookingRequestStatus.PENDING_QUOTE]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status update by client.")

    return crud.crud_booking_request.update_booking_request(
        db=db, db_booking_request=db_request, request_update=request_update
    )

@router.put("/{request_id}/artist", response_model=schemas.BookingRequestResponse)
def update_booking_request_by_artist(
    request_id: int,
    request_update: schemas.BookingRequestUpdateByArtist,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_active_artist)
):
    """
    Update a booking request status (e.g., decline it).
    Only accessible by the artist to whom the request was made.
    """
    db_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if db_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found")
    if db_request.artist_id != current_artist.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this request")

    # Artist can only update PENDING_QUOTE or QUOTE_PROVIDED (to decline, after quote)
    if db_request.status not in [models.BookingRequestStatus.PENDING_QUOTE, models.BookingRequestStatus.QUOTE_PROVIDED]:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot update request in status: {db_request.status.value}")

    # Validate status change by artist (e.g., only to REQUEST_DECLINED)
    if request_update.status and request_update.status != models.BookingRequestStatus.REQUEST_DECLINED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status update by artist.")
    
    # If artist is declining a request that already has a quote, this logic might need adjustment based on product decision
    # For now, assume declining the request means any existing quotes are implicitly void.

    return crud.crud_booking_request.update_booking_request(
        db=db, db_booking_request=db_request, request_update=request_update
    ) 