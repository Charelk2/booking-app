from fastapi import APIRouter, Depends, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import List
import logging

from .. import crud, models, schemas
from ..services import nlp_booking
from .dependencies import (
    get_db,
    get_current_user,
    get_current_active_client,
    get_current_service_provider,
)
from ..utils.notifications import (
    notify_user_new_booking_request,
    notify_booking_status_update,
    notify_user_new_message,
)
from ..utils.messages import BOOKING_DETAILS_PREFIX, preview_label_for_message
from ..utils import error_response, background_worker
from ..utils.redis_cache import invalidate_availability_cache
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


@router.post("/parse", status_code=status.HTTP_202_ACCEPTED)
def parse_booking_text(payload: schemas.BookingParseRequest):
    """Queue NLP parsing and return a task identifier."""

    task_id = background_worker.enqueue(nlp_booking.extract_booking_details, payload.text)
    return {"task_id": task_id}


@router.get(
    "/parse/{task_id}",
    response_model=schemas.ParsedBookingDetails,
    response_model_exclude_none=True,
)
async def get_parsed_booking(task_id: str):
    """Retrieve the NLP parsing result for a previously queued task."""

    try:
        return await background_worker.result(task_id)
    except KeyError:
        raise error_response(
            "Task not found",
            {"task_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    except nlp_booking.NLPModelError as exc:  # pragma: no cover - environment specific
        logger.error("NLP model error: %s", exc)
        raise error_response(
            "NLP model unavailable",
            {"text": "Model not loaded"},
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception as exc:  # pragma: no cover - unexpected errors
        logger.exception("NLP parsing failed: %s", exc)
        raise error_response(
            "Unable to parse booking details",
            {"text": "Parsing failed"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


@router.post(
    "/", response_model=schemas.BookingRequestResponse, response_model_exclude_none=True
)
def create_booking_request(
    request_in: schemas.BookingRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        get_current_active_client
    ),  # Changed to active client
):
    """
    Create a new booking request.
    A client makes a request to an artist.
    """
    # Ensure the artist exists
    artist_user = (
        db.query(models.User)
        .filter(
            models.User.id == request_in.artist_id,
            models.User.user_type == models.UserType.SERVICE_PROVIDER,
        )
        .first()
    )
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
        service = (
            db.query(models.Service)
            .filter(
                models.Service.id == request_in.service_id,
                models.Service.artist_id
                == request_in.artist_id,  # artist_id on service is artist_profiles.user_id
            )
            .first()
        )
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
    db.commit()
    db.refresh(new_request)
    # Store the initial notes on the booking request but avoid posting them as
    # a separate chat message. The details system message posted later contains
    # these notes, so creating a text message here would duplicate the content.
    # The chat thread used to include a generic "Booking request sent" system
    # message immediately after creation. This extra message cluttered the
    # conversation view, so it has been removed.
    crud.crud_message.create_message(
        db=db,
        booking_request_id=new_request.id,
        sender_id=current_user.id,
        sender_type=models.SenderType.CLIENT,
        content="You have a new booking request.",
        message_type=models.MessageType.SYSTEM,
        visible_to=models.VisibleTo.ARTIST,
    )
    # Optional: also emit a NEW_MESSAGE notification so thread unread counts
    # increment for service providers who rely on message threads as the sole
    # source of truth (and may not surface the general notifications bell).
    # Disabled by default to preserve existing behavior and tests; enable by
    # setting EMIT_NEW_MESSAGE_FOR_NEW_REQUEST=1 in the environment.
    try:
        if os.getenv("EMIT_NEW_MESSAGE_FOR_NEW_REQUEST") == "1":
            notify_user_new_message(
                db,
                user=artist_user,
                sender=current_user,
                booking_request_id=new_request.id,
                content="You have a new booking request.",
                message_type=models.MessageType.SYSTEM,
            )
    except Exception:
        # Non-fatal; do not block request creation if notification fails
        pass
    service = None
    if new_request.service_id:
        service = (
            db.query(models.Service)
            .filter(models.Service.id == new_request.service_id)
            .first()
        )
    booking_type = service.service_type if service else "General"
    sender_name = f"{current_user.first_name} {current_user.last_name}"
    if booking_type != "Personalized Video":
        notify_user_new_booking_request(
            db, artist_user, new_request.id, sender_name, booking_type
        )
    # Do not auto-post a chat system message on create; the notification above
    # is sufficient and avoids clutter/empty messages in the thread.
    invalidate_availability_cache(new_request.artist_id)
    return new_request


@router.get(
    "/me/client",
    response_model=List[schemas.BookingRequestResponse],
    response_model_exclude_none=True,
)
def read_my_client_booking_requests(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        get_current_active_client
    ),  # Changed to active client
):
    """
    Retrieve booking requests made by the current client.
    """
    requests = crud.crud_booking_request.get_booking_requests_with_last_message(
        db=db,
        client_id=current_user.id,
        skip=skip,
        limit=limit,
    )
    for req in requests:
        for q in req.quotes:
            q.booking_request = None
    return requests


@router.get(
    "/me/artist",
    response_model=List[schemas.BookingRequestResponse],
    response_model_exclude_none=True,
)
def read_my_artist_booking_requests(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(
        get_current_service_provider
    ),  # Artist specific endpoint
):
    """
    Retrieve booking requests made to the current artist.
    """
    requests = crud.crud_booking_request.get_booking_requests_with_last_message(
        db=db,
        artist_id=current_artist.id,
        skip=skip,
        limit=limit,
    )
    for req in requests:
        for q in req.quotes:
            q.booking_request = None
    return requests


@router.get(
    "/{request_id:int}",
    response_model=schemas.BookingRequestResponse,
    response_model_exclude_none=True,
)
def read_booking_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        get_current_user
    ),  # Changed to get_current_user
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
    if not (
        db_request.client_id == current_user.id
        or db_request.artist_id == current_user.id
    ):
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
            in [
                models.QuoteStatus.ACCEPTED_BY_CLIENT,
                models.QuoteStatus.CONFIRMED_BY_ARTIST,
            ]
        ),
        None,
    )
    if accepted:
        setattr(db_request, "accepted_quote_id", accepted.id)
    last_msg = crud.crud_message.get_last_message_for_request(db, db_request.id)
    if last_msg:
        # Derive display name to feed the preview helper for QUOTE messages
        sender_display = None
        if last_msg.sender_id == db_request.artist_id and db_request.artist:
            if db_request.artist.artist_profile and db_request.artist.artist_profile.business_name:
                sender_display = db_request.artist.artist_profile.business_name
            else:
                sender_display = f"{db_request.artist.first_name} {db_request.artist.last_name}"
        elif last_msg.sender_id == db_request.client_id and db_request.client:
            sender_display = f"{db_request.client.first_name} {db_request.client.last_name}"
        # Map booking status to thread state
        state = "requested"
        if db_request.status in [models.BookingStatus.QUOTE_PROVIDED]:
            state = "quoted"
        elif db_request.status in [models.BookingStatus.CONFIRMED, models.BookingStatus.REQUEST_CONFIRMED]:
            state = "confirmed"
        elif db_request.status in [models.BookingStatus.COMPLETED, models.BookingStatus.REQUEST_COMPLETED]:
            state = "completed"
        elif db_request.status in [models.BookingStatus.CANCELLED, models.BookingStatus.REQUEST_DECLINED, models.BookingStatus.REQUEST_WITHDRAWN, models.BookingStatus.QUOTE_REJECTED]:
            state = "cancelled"
        content = preview_label_for_message(last_msg, thread_state=state, sender_display=sender_display)
        setattr(db_request, "last_message_content", content)
        setattr(db_request, "last_message_timestamp", last_msg.timestamp)
    return db_request


@router.put(
    "/{request_id:int}/client",
    response_model=schemas.BookingRequestResponse,
    response_model_exclude_none=True,
)
def update_booking_request_by_client(
    request_id: int,
    request_update: schemas.BookingRequestUpdateByClient,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        get_current_active_client
    ),  # Changed to active client
):
    """
    Update a booking request (e.g., message, proposed times) or withdraw it.
    Only accessible by the client who created the request.
    """
    db_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
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
        models.BookingStatus.DRAFT,
        models.BookingStatus.PENDING_QUOTE,
        models.BookingStatus.REQUEST_WITHDRAWN,
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
        models.BookingStatus.REQUEST_WITHDRAWN,
        models.BookingStatus.PENDING_QUOTE,
        models.BookingStatus.DRAFT,
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
        service = (
            db.query(models.Service)
            .filter(
                models.Service.id == request_update.service_id,
                models.Service.artist_id == db_request.artist_id,
            )
            .first()
        )
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
    db.commit()
    db.refresh(updated)
    invalidate_availability_cache(db_request.artist_id)

    if request_update.status and request_update.status != prev_status:
        artist_user = (
            db.query(models.User).filter(models.User.id == db_request.artist_id).first()
        )
        if artist_user:
            notify_booking_status_update(
                db, artist_user, updated.id, updated.status.value
            )

    return updated


@router.put(
    "/{request_id:int}/artist",
    response_model=schemas.BookingRequestResponse,
    response_model_exclude_none=True,
)
def update_booking_request_by_artist(
    request_id: int,
    request_update: schemas.BookingRequestUpdateByArtist,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_service_provider),
):
    """
    Update a booking request status (e.g., decline it).
    Only accessible by the artist to whom the request was made.
    """
    db_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
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
        models.BookingStatus.DRAFT,
        models.BookingStatus.PENDING_QUOTE,
        models.BookingStatus.QUOTE_PROVIDED,
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
    if (
        request_update.status
        and request_update.status != models.BookingStatus.REQUEST_DECLINED
    ):
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
    db.commit()
    db.refresh(updated)
    invalidate_availability_cache(db_request.artist_id)

    if request_update.status and request_update.status != prev_status:
        client_user = (
            db.query(models.User).filter(models.User.id == db_request.client_id).first()
        )
        if client_user:
            if request_update.status == models.BookingStatus.REQUEST_DECLINED:
                crud.crud_message.create_message(
                    db=db,
                    booking_request_id=updated.id,
                    sender_id=current_artist.id,
                    sender_type=models.SenderType.ARTIST,
                    content="Artist declined the request.",
                    message_type=models.MessageType.SYSTEM,
                )
                notify_user_new_message(
                    db,
                    client_user,
                    current_artist,
                    updated.id,
                    "Artist declined the request.",
                    models.MessageType.SYSTEM,
                )
            else:
                notify_booking_status_update(
                    db, client_user, updated.id, updated.status.value
                )

    return updated


@router.get("/stats", summary="Get dashboard stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_service_provider),
):
    """Return monthly inquiries, profile views, and response rate for the artist."""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    monthly_inquiries = (
        db.query(models.BookingRequest)
        .filter(
            models.BookingRequest.artist_id == current_user.id,
            models.BookingRequest.created_at >= month_start,
            models.BookingRequest.status != models.BookingStatus.DRAFT,
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
            models.BookingRequest.status != models.BookingStatus.PENDING_QUOTE,
            models.BookingRequest.status != models.BookingStatus.DRAFT,
        )
        .count()
    )
    response_rate = (responded / total_requests * 100) if total_requests else 0.0

    return {
        "monthly_new_inquiries": monthly_inquiries,
        "profile_views": profile_views,
        "response_rate": round(response_rate, 2),
    }
