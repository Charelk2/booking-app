from fastapi import APIRouter, Depends, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import List
import logging

from .. import crud, models, schemas
from .dependencies import get_db, get_current_user, get_current_active_client, get_current_active_artist
from ..utils.notifications import (
    notify_user_new_booking_request,
    notify_booking_status_update,
)
from ..utils import error_response
import os
import uuid
import shutil

# Prefix is added when this router is included in `app/main.py`.
router = APIRouter(
    tags=["Booking Requests"],
)

logger = logging.getLogger(__name__)

ATTACHMENTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "static", "attachments")
)
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)


@router.post("/attachments", status_code=status.HTTP_201_CREATED)
async def upload_booking_attachment(file: UploadFile = File(...)):
    """Upload a temporary attachment prior to creating a booking request."""

    _, ext = os.path.splitext(file.filename)
    unique_filename = f"{uuid.uuid4()}{ext}"
    save_path = os.path.join(ATTACHMENTS_DIR, unique_filename)
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()
    url = f"/static/attachments/{unique_filename}"
    return {"url": url}

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
    artist_user = db.query(models.User).filter(
        models.User.id == request_in.artist_id,
        models.User.user_type == models.UserType.ARTIST,
    ).first()
    if not artist_user:
        logger.warning(
            "Artist not found when creating booking request; user_id=%s path=%s payload=%s",
            current_user.id,
            "/booking-requests/",
            request_in.model_dump(),
        )
        raise error_response(
            "Artist not found",
            {"artist_id": "Artist not found"},
            status.HTTP_404_NOT_FOUND,
        )
    
    # Ensure service_id, if provided, belongs to the specified artist_id
    if request_in.service_id:
        service = db.query(models.Service).filter(
            models.Service.id == request_in.service_id,
            models.Service.artist_id == request_in.artist_id,  # artist_id on service is artist_profiles.user_id
        ).first()
        if not service:
            logger.warning(
                "Invalid service_id in booking request; user_id=%s path=%s payload=%s",
                current_user.id,
                "/booking-requests/",
                request_in.model_dump(),
            )
            raise error_response(
                "Service ID does not match the specified artist or does not exist.",
                {"service_id": "Invalid service"},
                status.HTTP_400_BAD_REQUEST,
            )

    new_request = crud.crud_booking_request.create_booking_request(
        db=db, booking_request=request_in, client_id=current_user.id
    )
    # Store the initial notes on the booking request but avoid posting them as
    # a separate chat message. The details system message posted later contains
    # these notes, so creating a text message here would duplicate the content.
    # The chat thread used to include a generic "Booking request sent" system
    # message immediately after creation. This extra message cluttered the
    # conversation view, so it has been removed.
    service = None
    if new_request.service_id:
        service = db.query(models.Service).filter(models.Service.id == new_request.service_id).first()
    booking_type = service.service_type if service else "General"
    sender_name = f"{current_user.first_name} {current_user.last_name}"
    if booking_type != "Personalized Video":
        notify_user_new_booking_request(
            db, artist_user, new_request.id, sender_name, booking_type
        )
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
    requests = crud.crud_booking_request.get_booking_requests_by_client(
        db=db, client_id=current_user.id, skip=skip, limit=limit
    )
    for req in requests:
        for q in req.quotes:
            q.booking_request = None
        accepted = next(
            (
                q
                for q in req.quotes
                if q.status in [
                    models.QuoteStatus.ACCEPTED_BY_CLIENT,
                    models.QuoteStatus.CONFIRMED_BY_ARTIST,
                ]
            ),
            None,
        )
        if accepted:
            setattr(req, "accepted_quote_id", accepted.id)
        last_msg = crud.crud_message.get_last_message_for_request(db, req.id)
        if last_msg:
            setattr(req, "last_message_content", last_msg.content)
            setattr(req, "last_message_timestamp", last_msg.timestamp)
    return requests

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
    requests = crud.crud_booking_request.get_booking_requests_by_artist(
        db=db, artist_id=current_artist.id, skip=skip, limit=limit
    )
    for req in requests:
        for q in req.quotes:
            q.booking_request = None
        accepted = next(
            (
                q
                for q in req.quotes
                if q.status in [
                    models.QuoteStatus.ACCEPTED_BY_CLIENT,
                    models.QuoteStatus.CONFIRMED_BY_ARTIST,
                ]
            ),
            None,
        )
        if accepted:
            setattr(req, "accepted_quote_id", accepted.id)
        last_msg = crud.crud_message.get_last_message_for_request(db, req.id)
        if last_msg:
            setattr(req, "last_message_content", last_msg.content)
            setattr(req, "last_message_timestamp", last_msg.timestamp)
    return requests

@router.get("/{request_id:int}", response_model=schemas.BookingRequestResponse)
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
        raise error_response(
            "Inactive user",
            {"user": "Inactive"},
            status.HTTP_400_BAD_REQUEST,
        )
    db_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if db_request is None:
        raise error_response(
            "Booking request not found",
            {"request_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )
    if not (db_request.client_id == current_user.id or db_request.artist_id == current_user.id):
        raise error_response(
            "Not authorized to access this request",
            {"request_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )
    for q in db_request.quotes:
        q.booking_request = None
    accepted = next(
        (
            q
            for q in db_request.quotes
            if q.status
            in [models.QuoteStatus.ACCEPTED_BY_CLIENT, models.QuoteStatus.CONFIRMED_BY_ARTIST]
        ),
        None,
    )
    if accepted:
        setattr(db_request, "accepted_quote_id", accepted.id)
    last_msg = crud.crud_message.get_last_message_for_request(db, db_request.id)
    if last_msg:
        setattr(db_request, "last_message_content", last_msg.content)
        setattr(db_request, "last_message_timestamp", last_msg.timestamp)
    return db_request

@router.put("/{request_id:int}/client", response_model=schemas.BookingRequestResponse)
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
        logger.warning(
            "Booking request %s not found; user_id=%s path=%s payload=%s",
            request_id,
            current_user.id,
            f"/booking-requests/{request_id}/client",
            request_update.model_dump(),
        )
        raise error_response(
            "Booking request not found",
            {"request_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )
    if db_request.client_id != current_user.id:
        logger.warning(
            "User %s unauthorized to update booking request %s",
            current_user.id,
            request_id,
        )
        raise error_response(
            "Not authorized to update this request",
            {"request_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )
    
    # Prevent updating if artist has already provided a quote or declined
    if db_request.status not in [
        models.BookingRequestStatus.DRAFT,
        models.BookingRequestStatus.PENDING_QUOTE,
        models.BookingRequestStatus.REQUEST_WITHDRAWN,
    ]:
        logger.warning(
            "Invalid status %s for update by client; user_id=%s request_id=%s",
            db_request.status,
            current_user.id,
            request_id,
        )
        raise error_response(
            f"Cannot update request in status: {db_request.status.value}",
            {"status": "Invalid state"},
            status.HTTP_400_BAD_REQUEST,
        )

    # Validate status change if present
    if request_update.status and request_update.status not in [
        models.BookingRequestStatus.REQUEST_WITHDRAWN,
        models.BookingRequestStatus.PENDING_QUOTE,
        models.BookingRequestStatus.DRAFT,
    ]:
        logger.warning(
            "Client attempted invalid status update; user_id=%s request_id=%s payload=%s",
            current_user.id,
            request_id,
            {
                "status": str(request_update.status),
                "service_id": request_update.service_id,
            },
        )
        raise error_response(
            "Invalid status update by client.",
            {"status": "Not allowed"},
            status.HTTP_400_BAD_REQUEST,
        )

    if request_update.service_id:
        service = db.query(models.Service).filter(
            models.Service.id == request_update.service_id,
            models.Service.artist_id == db_request.artist_id,
        ).first()
        if not service:
            logger.warning(
                "Invalid service_id update by client; user_id=%s path=%s payload=%s",
                current_user.id,
                f"/booking-requests/{request_id}/client",
                request_update.model_dump(),
            )
            raise error_response(
                "Service ID does not match the specified artist or does not exist.",
                {"service_id": "Invalid service"},
                status.HTTP_400_BAD_REQUEST,
            )
    prev_status = db_request.status
    updated = crud.crud_booking_request.update_booking_request(
        db=db, db_booking_request=db_request, request_update=request_update
    )

    if request_update.status and request_update.status != prev_status:
        artist_user = db.query(models.User).filter(models.User.id == db_request.artist_id).first()
        if artist_user:
            notify_booking_status_update(
                db, artist_user, updated.id, updated.status.value
            )

    return updated

@router.put("/{request_id:int}/artist", response_model=schemas.BookingRequestResponse)
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
        logger.warning(
            "Booking request %s not found for artist update; user_id=%s path=%s",
            request_id,
            current_artist.id,
            f"/booking-requests/{request_id}/artist",
        )
        raise error_response(
            "Booking request not found",
            {"request_id": "Not found"},
            status.HTTP_404_NOT_FOUND,
        )
    if db_request.artist_id != current_artist.id:
        logger.warning(
            "Artist %s unauthorized to update booking request %s",
            current_artist.id,
            request_id,
        )
        raise error_response(
            "Not authorized to update this request",
            {"request_id": "Forbidden"},
            status.HTTP_403_FORBIDDEN,
        )

    # Artist can only update DRAFT, PENDING_QUOTE or QUOTE_PROVIDED (to decline, after quote)
    if db_request.status not in [
        models.BookingRequestStatus.DRAFT,
        models.BookingRequestStatus.PENDING_QUOTE,
        models.BookingRequestStatus.QUOTE_PROVIDED,
    ]:
        logger.warning(
            "Invalid status %s for update by artist; user_id=%s request_id=%s",
            db_request.status,
            current_artist.id,
            request_id,
        )
        raise error_response(
            f"Cannot update request in status: {db_request.status.value}",
            {"status": "Invalid state"},
            status.HTTP_400_BAD_REQUEST,
        )

    # Validate status change by artist (e.g., only to REQUEST_DECLINED)
    if request_update.status and request_update.status != models.BookingRequestStatus.REQUEST_DECLINED:
        logger.warning(
            "Artist attempted invalid status update; user_id=%s request_id=%s payload=%s",
            current_artist.id,
            request_id,
            {"status": str(request_update.status)},
        )
        raise error_response(
            "Invalid status update by artist.",
            {"status": "Not allowed"},
            status.HTTP_400_BAD_REQUEST,
        )
    
    # If artist is declining a request that already has a quote, this logic might need adjustment based on product decision
    # For now, assume declining the request means any existing quotes are implicitly void.

    prev_status = db_request.status
    updated = crud.crud_booking_request.update_booking_request(
        db=db, db_booking_request=db_request, request_update=request_update
    )

    if request_update.status and request_update.status != prev_status:
        client_user = db.query(models.User).filter(models.User.id == db_request.client_id).first()
        if client_user:
            notify_booking_status_update(
                db, client_user, updated.id, updated.status.value
            )

    return updated


@router.get("/stats", summary="Get dashboard stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_artist),
):
    """Return monthly inquiries, profile views, and response rate for the artist."""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    monthly_inquiries = (
        db.query(models.BookingRequest)
        .filter(
            models.BookingRequest.artist_id == current_user.id,
            models.BookingRequest.created_at >= month_start,
            models.BookingRequest.status != models.BookingRequestStatus.DRAFT,
        )
        .count()
    )

    profile_views = (
        db.query(func.count(models.ArtistProfileView.id))
        .filter(models.ArtistProfileView.artist_id == current_user.id)
        .scalar()
        or 0
    )

    total_requests = (
        db.query(models.BookingRequest)
        .filter(models.BookingRequest.artist_id == current_user.id)
        .count()
    )
    responded = (
        db.query(models.BookingRequest)
        .filter(
            models.BookingRequest.artist_id == current_user.id,
            models.BookingRequest.status
            != models.BookingRequestStatus.PENDING_QUOTE,
            models.BookingRequest.status
            != models.BookingRequestStatus.DRAFT,
        )
        .count()
    )
    response_rate = (responded / total_requests * 100) if total_requests else 0.0

    return {
        "monthly_new_inquiries": monthly_inquiries,
        "profile_views": profile_views,
        "response_rate": round(response_rate, 2),
    }
