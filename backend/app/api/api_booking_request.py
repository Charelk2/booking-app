from fastapi import APIRouter, Depends, status, UploadFile, File, Header, Response, Query
from fastapi.responses import ORJSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import List, Any, Optional, Literal
from pydantic import BaseModel
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
from ..services.quote_totals import quote_preview_fields
import os
import uuid
import shutil

# Prefix is added when this router is included in `app/main.py`.
router = APIRouter(
    tags=["Booking Requests"],
    default_response_class=ORJSONResponse,
)

logger = logging.getLogger(__name__)

DEFAULT_ATTACHMENTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "static", "attachments")
)
ATTACHMENTS_DIR = os.getenv("ATTACHMENTS_DIR", DEFAULT_ATTACHMENTS_DIR)
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)


def _prepare_quotes_for_response(quotes: list[Any] | None) -> None:
    if not quotes:
        return
    for q in quotes:
        try:
            setattr(q, "booking_request", None)
        except Exception:
            continue
        try:
            fields = quote_preview_fields(q)
            for key, value in fields.items():
                setattr(q, key, value)
        except Exception:
            continue


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


@router.get("/{request_id}/booking-id", summary="Resolve booking id for a booking request")
def get_booking_id_for_request(
    request_id: int,
    db: Session = Depends(get_db),
):
    """
    Return the Booking.id associated with a given booking request, if any.

    This is a lightweight resolver that avoids downloading full booking lists
    on the client just to discover a single id. It checks both v2 and legacy
    quote linkages that may have created a Booking.
    """
    # Try v2 quotes: bookings.quote_id matches quotes_v2.id
    booking = (
        db.query(models.Booking.id)
        .join(models.QuoteV2, models.Booking.quote_id == models.QuoteV2.id)
        .filter(models.QuoteV2.booking_request_id == request_id)
        .order_by(models.Booking.id.desc())
        .first()
    )
    if booking is None:
        # Fallback to legacy quotes table
        booking = (
            db.query(models.Booking.id)
            .join(models.Quote, models.Booking.quote_id == models.Quote.id)
            .filter(models.Quote.booking_request_id == request_id)
            .order_by(models.Booking.id.desc())
            .first()
        )
    return {"booking_id": (booking[0] if booking else None)}


class ReportProblemPayload(BaseModel):
    category: Literal[
        "service_quality",
        "no_show",
        "late",
        "payment",
        "other",
    ] = "other"
    description: Optional[str] = None


@router.post(
    "/{request_id}/report-problem",
    status_code=status.HTTP_201_CREATED,
    summary="Report a problem / open a dispute for a booking tied to this thread",
)
def report_problem_for_request(
    request_id: int,
    body: ReportProblemPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Open or append to a dispute for the booking associated with this booking request.

    Anchored in the inbox: only the client or artist on this thread may report
    a problem. Uses the lightweight ``disputes`` table managed by db_utils.
    """
    db_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if db_request is None:
        raise error_response(
            "Booking request not found",
            {"request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    if current_user.id not in {db_request.client_id, db_request.artist_id}:
        raise error_response(
            "You are not allowed to report a problem on this request.",
            {"request_id": "forbidden"},
            status.HTTP_403_FORBIDDEN,
        )

    resolved = get_booking_id_for_request(request_id=request_id, db=db)
    booking_id = resolved.get("booking_id") if isinstance(resolved, dict) else None
    if not booking_id:
        raise error_response(
            "Cannot report a problem for this request because no booking was created.",
            {"booking_id": "missing"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    booking = db.query(models.Booking).filter(models.Booking.id == int(booking_id)).first()
    if booking is None:
        raise error_response(
            "Booking not found for this request.",
            {"booking_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    # For now, restrict to confirmed/completed events.
    if booking.status not in [
        models.BookingStatus.CONFIRMED,
        models.BookingStatus.COMPLETED,
    ]:
        raise error_response(
            "You can only report a problem for confirmed or completed bookings.",
            {"status": booking.status.value},
            status.HTTP_400_BAD_REQUEST,
        )

    Dispute = models.Dispute  # noqa: N806
    dispute = (
        db.query(Dispute)
        .filter(
            Dispute.booking_id == int(booking_id),
            Dispute.status.in_(["open", "needs_info"]),
        )
        .first()
    )

    notes = {}
    if dispute and dispute.notes and isinstance(dispute.notes, dict):
        notes = dict(dispute.notes)

    entry = {
        "by_user_id": int(current_user.id),
        "by_role": getattr(current_user, "user_type", None),
        "category": body.category,
        "description": body.description,
    }
    reports = []
    if isinstance(notes.get("reports"), list):
        reports.extend(notes["reports"])
    reports.append(entry)
    notes["reports"] = reports

    if not dispute:
        dispute = Dispute(
            booking_id=int(booking_id),
            status="open",
            reason=body.category,
            notes=notes,
        )
        db.add(dispute)
    else:
        dispute.reason = dispute.reason or body.category
        dispute.notes = notes
    db.commit()
    db.refresh(dispute)

    # Emit a system message into the thread so both parties see that a dispute
    # is open; admins consume the disputes table via api_admin.
    sender_type = (
        models.SenderType.CLIENT
        if current_user.user_type == models.UserType.CLIENT
        else models.SenderType.ARTIST
    )
    visible_to = (
        models.VisibleTo.CLIENT
        if current_user.user_type == models.UserType.CLIENT
        else models.VisibleTo.ARTIST
    )
    msg = crud.crud_message.create_message(
        db=db,
        booking_request_id=request_id,
        sender_id=current_user.id,
        sender_type=sender_type,
        content=(
            "A problem has been reported for this event. Our team will review the "
            "details. Messages in this chat are still visible to both parties, "
            "but we may step in if needed."
        ),
        message_type=models.MessageType.SYSTEM,
        visible_to=visible_to,
        system_key="dispute_opened_v1",
    )
    try:
        artist = db.query(models.User).filter(models.User.id == db_request.artist_id).first()
        client = db.query(models.User).filter(models.User.id == db_request.client_id).first()
        if artist and client:
            # Only notify the reporter; the counterparty should not see a new
            # system bubble for the complaint itself, but admins can still
            # review it via the disputes table.
            if current_user.id == client.id:
                notify_user_new_message(db, client, artist, request_id, msg.content, models.MessageType.SYSTEM)  # type: ignore[arg-type]
            elif current_user.id == artist.id:
                notify_user_new_message(db, artist, client, request_id, msg.content, models.MessageType.SYSTEM)  # type: ignore[arg-type]
    except Exception:
        pass

    return {
        "status": dispute.status,
        "dispute_id": int(dispute.id),
        "booking_id": int(booking_id),
    }


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
    # Ensure timestamps present for response validation in legacy DBs lacking defaults
    if getattr(new_request, "created_at", None) is None:
        new_request.created_at = datetime.utcnow()
    if getattr(new_request, "updated_at", None) is None:
        new_request.updated_at = new_request.created_at
    try:
        db.add(new_request)
        db.commit()
        db.refresh(new_request)
    except Exception:
        db.rollback()
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
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    lite: bool = Query(True, description="Return a lighter shape for list views"),
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        get_current_active_client
    ),  # Changed to active client
):
    """
    Retrieve booking requests made by the current client.
    """
    # Cheap snapshot for ETag: max ids + count
    try:
        max_br = (
            db.query(func.coalesce(func.max(models.BookingRequest.id), 0))
            .filter(models.BookingRequest.client_id == current_user.id)
            .scalar()
        ) or 0
    except Exception:
        max_br = 0
    try:
        total_count = (
            db.query(func.count(models.BookingRequest.id))
            .filter(models.BookingRequest.client_id == current_user.id)
            .scalar()
        ) or 0
    except Exception:
        total_count = 0
    etag = f'W/"brc:{int(current_user.id)}:{int(max_br)}:{int(total_count)}:{int(skip)}:{int(limit)}:{int(bool(lite))}"'
    if if_none_match and if_none_match.strip() == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag, "Vary": "If-None-Match"})

    requests = crud.crud_booking_request.get_booking_requests_with_last_message(
        db=db,
        client_id=current_user.id,
        skip=skip,
        limit=limit,
        include_relationships=not lite,
        viewer=models.VisibleTo.CLIENT,
        per_request_messages=1 if lite else 3,
    )
    for req in requests:
        # Defensive: ensure timestamps present for response validation
        if getattr(req, "created_at", None) is None:
            req.created_at = datetime.utcnow()
        if getattr(req, "updated_at", None) is None:
            req.updated_at = req.created_at
        if not lite:
            _prepare_quotes_for_response(list(req.quotes or []))
    try:
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "no-cache, private"
        response.headers["Vary"] = "If-None-Match"
    except Exception:
        pass
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
        viewer=models.VisibleTo.ARTIST,
    )
    for req in requests:
        if getattr(req, "created_at", None) is None:
            req.created_at = datetime.utcnow()
        if getattr(req, "updated_at", None) is None:
            req.updated_at = req.created_at
        _prepare_quotes_for_response(list(req.quotes or []))
    return requests


@router.get(
    "/{request_id:int}",
    response_model=schemas.BookingRequestResponse,
    response_model_exclude_none=True,
)
def read_booking_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    if_none_match: str | None = Header(default=None, convert_underscores=False, alias="If-None-Match"),
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
    _prepare_quotes_for_response(list(db_request.quotes or []))
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
    # Defensive: ensure timestamps present for response validation
    if getattr(db_request, "created_at", None) is None:
        db_request.created_at = datetime.utcnow()
    if getattr(db_request, "updated_at", None) is None:
        db_request.updated_at = db_request.created_at
    # ETag support: generate a weak ETag based on id + updated_at + last_message_timestamp + provider VAT snapshot
    try:
        from hashlib import sha1
        last_ts = getattr(db_request, "last_message_timestamp", None)
        marker_last = last_ts.isoformat(timespec="seconds") if last_ts else "0"
        marker_upd = db_request.updated_at.isoformat(timespec="seconds") if db_request.updated_at else "0"
        vat_reg = None
        vat_rate = None
        try:
            prof = getattr(db_request, "artist_profile", None)
            if prof is None and getattr(db_request, "artist", None) is not None:
                prof = getattr(db_request.artist, "artist_profile", None)
            if prof is not None:
                vat_reg = getattr(prof, "vat_registered", None)
                vat_rate = getattr(prof, "vat_rate", None)
        except Exception:
            vat_reg = None
            vat_rate = None
        marker_vat = f"{'1' if vat_reg is True else '0' if vat_reg is False else ''}:{str(vat_rate or '')}"
        basis = f"{marker_upd}:{marker_last}:{marker_vat}"
        etag = f'W/"br:{int(db_request.id)}:{sha1(basis.encode()).hexdigest()}"'
        if if_none_match and if_none_match.strip() == etag:
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})
    except Exception:
        etag = None
    resp = Response(status_code=status.HTTP_200_OK)
    try:
        if etag:
            resp.headers["ETag"] = etag
            resp.headers["Cache-Control"] = "no-cache"
    except Exception:
        pass
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
