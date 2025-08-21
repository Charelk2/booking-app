# backend/app/api/v1/api_booking.py

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks
from sqlalchemy.orm import Session, selectinload
from fastapi.responses import Response
from ics import Calendar, Event
from typing import List, Any
from decimal import Decimal

from ..database import get_db
from .. import models
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
from ..schemas.event_prep import EventPrepResponse, EventPrepPatch
from ..crud import crud_event_prep
from .api_ws import manager
from ..models.message import MessageType, SenderType, VisibleTo
from ..utils import error_response
from .api_sound_outreach import kickoff_sound_outreach
from pydantic import BaseModel

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

    # If artist cancels while awaiting acceptance, release any authorized holds
    if (
        prev_status == BookingStatus.PENDING_ARTIST_CONFIRMATION
        and booking.status == BookingStatus.CANCELLED
    ):
        try:
            bs = (
                db.query(BookingSimple)
                .filter(BookingSimple.quote_id == booking.quote_id)
                .first()
            )
            if bs:
                if bs.artist_hold_status == "authorized":
                    bs.artist_hold_status = "released"
                if bs.sound_hold_status == "authorized":
                    bs.sound_hold_status = "released"
                db.add(bs)
                db.commit()
        except Exception:
            pass

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


# ─── EVENT PREP ROUTES (under /api/v1/bookings/{booking_id}/event-prep) ───────────

def _ensure_participant_or_404(db: Session, booking_id: int, user: User) -> Booking:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if user.id not in [booking.client_id, booking.artist_id]:
        raise error_response("Not authorized", {}, status.HTTP_404_NOT_FOUND)
    return booking


def _find_booking_request_id(db: Session, booking_id: int) -> int | None:
    return crud_event_prep._resolve_booking_request_id(db, booking_id)  # reuse internal helper


def _as_response(db: Session, ep: models.EventPrep) -> EventPrepResponse:
    done, total = crud_event_prep.compute_progress(db, ep.booking_id, ep)
    return EventPrepResponse(
        booking_id=ep.booking_id,
        day_of_contact_name=ep.day_of_contact_name,
        day_of_contact_phone=ep.day_of_contact_phone,
        venue_address=ep.venue_address,
        venue_place_id=ep.venue_place_id,
        venue_lat=float(ep.venue_lat) if ep.venue_lat is not None else None,
        venue_lng=float(ep.venue_lng) if ep.venue_lng is not None else None,
        loadin_start=ep.loadin_start.isoformat() if ep.loadin_start else None,
        loadin_end=ep.loadin_end.isoformat() if ep.loadin_end else None,
        # Ensure all schedule times round-trip in the API response
        soundcheck_time=ep.soundcheck_time.isoformat() if ep.soundcheck_time else None,
        guests_arrival_time=ep.guests_arrival_time.isoformat() if ep.guests_arrival_time else None,
        performance_start_time=ep.performance_start_time.isoformat() if ep.performance_start_time else None,
        performance_end_time=ep.performance_end_time.isoformat() if ep.performance_end_time else None,
        tech_owner=ep.tech_owner,
        stage_power_confirmed=ep.stage_power_confirmed,
        accommodation_required=ep.accommodation_required,
        accommodation_address=ep.accommodation_address,
        accommodation_contact=ep.accommodation_contact,
        accommodation_notes=ep.accommodation_notes,
        notes=ep.notes,
        schedule_notes=ep.schedule_notes,
        parking_access_notes=ep.parking_access_notes,
        progress_done=done,
        progress_total=total,
    )


@router.get("/{booking_id}/event-prep", response_model=EventPrepResponse)
def get_event_prep(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = _ensure_participant_or_404(db, booking_id, current_user)
    # Idempotent bootstrap: create seed record if missing
    ep = crud_event_prep.get_by_booking_id(db, booking.id) or crud_event_prep.seed_for_booking(db, booking)
    return _as_response(db, ep)


@router.patch("/{booking_id}/event-prep", response_model=EventPrepResponse)
def patch_event_prep(
    booking_id: int,
    patch: EventPrepPatch,
    request: Request,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = _ensure_participant_or_404(db, booking_id, current_user)
    # Idempotency support (24h window)
    key = request.headers.get("Idempotency-Key")
    is_dup, existing = crud_event_prep.idempotency_check(
        db,
        booking.id,
        key,
        request_hash=str(patch.model_dump_json()) if hasattr(patch, "model_dump_json") else str(patch.dict()),
    )
    if is_dup and existing:
        return _as_response(db, existing)

    ep = crud_event_prep.upsert(
        db,
        booking.id,
        patch.model_dump(exclude_unset=True),
        updated_by_user_id=current_user.id,
    )

    br_id = _find_booking_request_id(db, booking.id)
    # Post minimal system message
    try:
        if br_id is not None:
            content = "Event prep updated"
            # Specialize for common updates when clear
            p = patch.model_dump(exclude_unset=True)
            if p.get("day_of_contact_name") or p.get("day_of_contact_phone"):
                name = p.get("day_of_contact_name") or ep.day_of_contact_name or ""
                phone = p.get("day_of_contact_phone") or ep.day_of_contact_phone or ""
                pretty = (f"{name} ({phone})" if name or phone else "updated")
                content = f"Day-of contact added: {pretty}".strip()
                sys_key = "event_prep_contact_saved"
            elif p.get("loadin_start") or p.get("loadin_end"):
                content = "Load-in window updated"
                sys_key = "event_prep_loadin_saved"
            elif "tech_owner" in p:
                content = f"Tech owner set to {p.get('tech_owner') or ep.tech_owner}"
                sys_key = "event_prep_tech_owner_updated"
            elif p.get("stage_power_confirmed") is True:
                content = "Stage power confirmed"
                sys_key = "event_prep_stage_power_confirmed"
            elif "parking_access_notes" in p:
                content = "Parking & access notes updated"
                sys_key = "event_prep_parking_access_notes_updated"
            elif "schedule_notes" in p:
                content = "Schedule notes updated"
                sys_key = "event_prep_schedule_notes_updated"
            else:
                sys_key = "event_prep_updated"

            from ..crud import crud_message
            crud_message.create_message(
                db=db,
                booking_request_id=br_id,
                sender_id=booking.artist_id,
                sender_type=SenderType.ARTIST,
                content=content,
                message_type=MessageType.SYSTEM,
                visible_to=VisibleTo.BOTH,
                system_key=sys_key,
            )
            db.commit()
    except Exception:
        pass

    # WebSocket broadcast on thread channel
    try:
        if br_id is not None:
            background_tasks.add_task(
                manager.broadcast,
                br_id,
                {
                    "type": "event_prep_updated",
                    "payload": _as_response(db, ep).model_dump(),
                },
            )
    except Exception:
        pass

    return _as_response(db, ep)


@router.post("/{booking_id}/event-prep/complete-task", response_model=EventPrepResponse)
def complete_event_prep_task(
    booking_id: int,
    body: dict,
    request: Request,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = _ensure_participant_or_404(db, booking_id, current_user)
    key = request.headers.get("Idempotency-Key")
    is_dup, existing = crud_event_prep.idempotency_check(db, booking.id, key, str(body))
    if is_dup and existing:
        return _as_response(db, existing)

    key_name = (body or {}).get("key")
    value = (body or {}).get("value")

    patch: dict[str, Any] = {}
    system_key = "event_prep_updated"
    content = "Event prep updated"
    if key_name == "day_of_contact":
        if isinstance(value, dict):
            patch["day_of_contact_name"] = value.get("name")
            patch["day_of_contact_phone"] = value.get("phone")
        system_key = "event_prep_contact_saved"
        name = (value or {}).get("name") or ""
        phone = (value or {}).get("phone") or ""
        content = f"Day-of contact added: {name} ({phone})".strip()
    elif key_name == "loadin":
        if isinstance(value, dict):
            patch["loadin_start"] = value.get("start")
            patch["loadin_end"] = value.get("end")
        system_key = "event_prep_loadin_saved"
        content = "Load-in window updated"
    elif key_name == "tech_owner":
        patch["tech_owner"] = value or "venue"
        system_key = "event_prep_tech_owner_updated"
        content = f"Tech owner set to {patch['tech_owner']}"
    elif key_name == "stage_power":
        patch["stage_power_confirmed"] = bool(value)
        system_key = "event_prep_stage_power_confirmed"
        content = "Stage power confirmed" if patch["stage_power_confirmed"] else "Stage power unconfirmed"
    elif key_name == "venue_address":
        patch["venue_address"] = value
        content = "Venue address saved"
    elif key_name == "accommodation":
        if isinstance(value, dict):
            for k in ("accommodation_required", "accommodation_address", "accommodation_contact", "accommodation_notes"):
                if k in value:
                    patch[k] = value[k]
        content = "Accommodation details updated"
    elif key_name == "notes":
        patch["notes"] = value
        content = "Event notes updated"
    elif key_name == "parking_access_notes":
        patch["parking_access_notes"] = value
        content = "Parking & access notes updated"

    ep = crud_event_prep.upsert(db, booking.id, patch, updated_by_user_id=current_user.id)

    br_id = _find_booking_request_id(db, booking.id)
    try:
        if br_id is not None:
            from ..crud import crud_message
            crud_message.create_message(
                db=db,
                booking_request_id=br_id,
                sender_id=booking.artist_id,
                sender_type=SenderType.ARTIST,
                content=content,
                message_type=MessageType.SYSTEM,
                visible_to=VisibleTo.BOTH,
                system_key=system_key,
            )
            db.commit()
    except Exception:
        pass

    try:
        if br_id is not None:
            background_tasks.add_task(
                manager.broadcast,
                br_id,
                {
                    "type": "event_prep_updated",
                    "payload": _as_response(db, ep).model_dump(),
                },
            )
    except Exception:
        pass

    return _as_response(db, ep)


# ─── Event Prep Attachments (structured) ─────────────────────────────────────

class EventPrepAttachmentIn(BaseModel):
    url: str


@router.get("/{booking_id}/event-prep/attachments")
def list_event_prep_attachments(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = _ensure_participant_or_404(db, booking_id, current_user)
    ep = crud_event_prep.get_by_booking_id(db, booking.id) or crud_event_prep.seed_for_booking(db, booking)
    rows = (
        db.query(models.EventPrepAttachment)
        .filter(models.EventPrepAttachment.event_prep_id == ep.id)
        .order_by(models.EventPrepAttachment.created_at.desc())
        .all()
    )
    return [{"id": r.id, "file_url": r.file_url, "created_at": r.created_at} for r in rows]


@router.post("/{booking_id}/event-prep/attachments", status_code=status.HTTP_201_CREATED)
def add_event_prep_attachment(
    booking_id: int,
    body: EventPrepAttachmentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = _ensure_participant_or_404(db, booking_id, current_user)
    ep = crud_event_prep.get_by_booking_id(db, booking.id) or crud_event_prep.seed_for_booking(db, booking)
    att = models.EventPrepAttachment(event_prep_id=ep.id, file_url=body.url)
    db.add(att)
    db.commit()
    db.refresh(att)
    # Broadcast a lightweight update for attachments consumers
    try:
        br_id = _find_booking_request_id(db, booking.id)
        if br_id is not None:
            manager.broadcast(br_id, {"type": "event_prep_updated", "payload": _as_response(db, ep).model_dump()})
    except Exception:
        pass
    return {"id": att.id, "file_url": att.file_url, "created_at": att.created_at}


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


@router.post("/{booking_id}/artist/accept", response_model=BookingResponse)
def artist_accept_booking(
    *,
    db: Session = Depends(get_db),
    booking_id: int,
    requires_sound: bool | None = None,
    sound_mode: str | None = None,  # 'supplier' (default) | 'provided_by_artist' | 'client_provided' | 'managed_by_artist'
    event_city: str | None = None,
    current_artist: User = Depends(get_current_service_provider),
):
    """Artist accepts a booking and optionally starts sound outreach.

    - If ``requires_sound`` resolves False → set CONFIRMED.
    - If True → set PENDING_SOUND and kick off outreach sequentially.
    - ``requires_sound`` is resolved from the booking request travel_breakdown when omitted.
    """
    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.artist_id == current_artist.id)
        .first()
    )
    if not booking:
        raise error_response(
            "Booking not found or forbidden",
            {"booking_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    # Resolve requires_sound and sound_mode from the associated request if not provided
    if requires_sound is None:
        # Join via QuoteV2 linkage exposed in GET /bookings
        row = (
            db.query(Booking, QuoteV2.booking_request_id)
            .outerjoin(BookingSimple, BookingSimple.quote_id == QuoteV2.id)
            .outerjoin(QuoteV2, BookingSimple.quote_id == QuoteV2.id)
            .filter(Booking.id == booking_id)
            .first()
        )
        br_id = row[1] if row else None
        if br_id:
            br = (
                db.query(models.BookingRequest)
                .filter(models.BookingRequest.id == br_id)
                .first()
            )
            tb = br.travel_breakdown or {}
            requires_sound = bool(tb.get("sound_required")) if isinstance(tb, dict) else False
            if not event_city and isinstance(tb, dict):
                event_city = tb.get("event_city")
            if sound_mode is None and isinstance(tb, dict):
                sound_mode = tb.get("sound_mode")

    if not requires_sound or (sound_mode in {"client_provided", "provided_by_artist"}):
        booking.status = BookingStatus.CONFIRMED
        db.add(booking)
        db.commit()
        # Capture artist hold if present
        simple = (
            db.query(models.BookingSimple)
            .filter(models.BookingSimple.quote_id == booking.quote_id)
            .first()
        )
        if simple and simple.artist_hold_status == "authorized":
            simple.artist_hold_status = "captured"
            db.add(simple)
            db.commit()
        # If client_provided sound, release sound hold; if provided_by_artist, capture it as firm
        if simple:
            if sound_mode == "client_provided" and simple.sound_hold_status == "authorized":
                simple.sound_hold_status = "released"
                db.add(simple)
                db.commit()
            elif sound_mode == "provided_by_artist" and simple.sound_hold_status == "authorized":
                simple.sound_hold_status = "captured"
                db.add(simple)
                db.commit()
                # Mark quote sound as firm; set amount from provided estimate if present
                qv2 = (
                    db.query(QuoteV2)
                    .filter(QuoteV2.id == simple.quote_id)
                    .first()
                )
                if qv2:
                    # Attempt to read provided estimate from booking request travel_breakdown
                    br = db.query(models.BookingRequest).filter(models.BookingRequest.id == qv2.booking_request_id).first()
                    est = None
                    if br and isinstance(br.travel_breakdown, dict):
                        try:
                            est = float(br.travel_breakdown.get("provided_sound_estimate"))
                        except Exception:
                            est = None
                    if est is not None and est >= 0:
                        qv2.sound_fee = est
                    qv2.sound_firm = "true"
                    # Recompute totals
                    service_sum = sum((item.get("price", 0) or 0) for item in (qv2.services or []))
                    qv2.subtotal = service_sum + qv2.sound_fee + qv2.travel_fee
                    if qv2.discount:
                        qv2.total = qv2.subtotal - qv2.discount
                    else:
                        qv2.total = qv2.subtotal
                    db.add(qv2)
                    db.commit()
        # Post timeline update to original thread
        br_id = None
        qv2 = (
            db.query(QuoteV2)
            .filter(QuoteV2.id == simple.quote_id)
            .first() if simple else None
        )
        if qv2:
            br_id = qv2.booking_request_id
        if br_id:
            crud.crud_message.create_message(
                db=db,
                booking_request_id=br_id,
                sender_id=current_artist.id,
                sender_type=models.SenderType.ARTIST,
                content=(
                    "Artist confirmed — your date is locked." if not sound_mode or sound_mode == "client_provided" else "Artist confirmed — sound provided by artist."
                ),
                message_type=models.MessageType.SYSTEM,
                visible_to=models.VisibleTo.CLIENT,
            )
        return (
            db.query(Booking)
            .options(
                selectinload(Booking.client),
                selectinload(Booking.service),
                selectinload(Booking.source_quote),
            )
            .filter(Booking.id == booking_id)
            .first()
        )

    # Requires sound → start outreach
    city = event_city or booking.event_city
    if not city:
        raise error_response(
            "event_city required to start outreach",
            {"event_city": "required"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    res = kickoff_sound_outreach(
        booking_id,
        event_city=city,
        request_timeout_hours=24,
        mode="sequential",
        selected_service_id=None,
        db=db,
        current_artist=current_artist,
    )
    # Capture artist hold if present since artist accepted
    simple = (
        db.query(models.BookingSimple)
        .filter(models.BookingSimple.quote_id == booking.quote_id)
        .first()
    )
    if simple and simple.artist_hold_status == "authorized":
        simple.artist_hold_status = "captured"
        db.add(simple)
        db.commit()
    # Post timeline update
    br_id = None
    qv2 = (
        db.query(QuoteV2)
        .filter(QuoteV2.id == simple.quote_id)
        .first() if simple else None
    )
    if qv2:
        br_id = qv2.booking_request_id
    if br_id:
        crud.crud_message.create_message(
            db=db,
            booking_request_id=br_id,
            sender_id=current_artist.id,
            sender_type=models.SenderType.ARTIST,
            content="Artist confirmed — we’re confirming sound now.",
            message_type=models.MessageType.SYSTEM,
            visible_to=models.VisibleTo.CLIENT,
        )
    # Return updated booking state
    return (
        db.query(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.service),
            selectinload(Booking.source_quote),
        )
        .filter(Booking.id == booking_id)
        .first()
    )
