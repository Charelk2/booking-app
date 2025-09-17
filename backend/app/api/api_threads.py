from fastapi import APIRouter, Depends, Query, status, Response, Header
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional

from .. import models
from ..schemas.threads import (
    ThreadPreviewItem,
    ThreadPreviewResponse,
    Counterparty,
)
from ..schemas.threads_index import ThreadsIndexItem, ThreadsIndexResponse
from .dependencies import get_db, get_current_user, get_current_active_client
from .. import schemas
from ..crud import crud_booking_request, crud_notification, crud_message
from ..utils.messages import preview_label_for_message
import re
import json
from pydantic import BaseModel
from datetime import datetime
import hashlib

router = APIRouter(tags=["threads"])


def _state_from_status(status: "models.BookingStatus") -> str:
    if status in [models.BookingStatus.DRAFT, models.BookingStatus.PENDING_QUOTE, models.BookingStatus.PENDING]:
        return "requested"
    if status in [models.BookingStatus.QUOTE_PROVIDED]:
        return "quoted"
    if status in [models.BookingStatus.CONFIRMED, models.BookingStatus.REQUEST_CONFIRMED]:
        return "confirmed"
    if status in [models.BookingStatus.COMPLETED, models.BookingStatus.REQUEST_COMPLETED]:
        return "completed"
    if status in [
        models.BookingStatus.CANCELLED,
        models.BookingStatus.REQUEST_DECLINED,
        models.BookingStatus.REQUEST_WITHDRAWN,
        models.BookingStatus.QUOTE_REJECTED,
    ]:
        return "cancelled"
    return "requested"


@router.get("/message-threads/preview", response_model=ThreadPreviewResponse)
def get_threads_preview(
    role: Optional[str] = Query(None, regex="^(artist|client)$"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return atomic thread previews with unread counts.

    - Combines booking-request last message with grouped unread counts
    - Computes counterparty name/avatar and a concise last_message_preview
    - Ignores `cursor` for now (placeholder); orders by last_ts desc
    """

    is_artist = current_user.user_type == models.UserType.SERVICE_PROVIDER
    if role == "client":
        is_artist = False
    elif role == "artist":
        is_artist = True

    # Get booking requests with last message content/timestamp
    brs = crud_booking_request.get_booking_requests_with_last_message(
        db,
        artist_id=current_user.id if is_artist else None,
        client_id=current_user.id if not is_artist else None,
        skip=0,
        limit=limit,
    )

    # Map unread counts via notification aggregator
    threads = crud_notification.get_message_thread_notifications(db, current_user.id)
    unread_by_id: Dict[int, int] = {t["booking_request_id"]: int(t.get("unread_count", 0)) for t in threads}

    items: List[ThreadPreviewItem] = []
    for br in brs:
        last_m = getattr(br, "_last_message", None)
        preview_message = getattr(br, "_preview_message", last_m)
        last_ts = getattr(br, "last_message_timestamp", None) or br.created_at
        last_actor = "system"
        if last_m:
            if last_m.message_type == models.MessageType.SYSTEM:
                last_actor = "system"
            else:
                last_actor = (
                    "artist"
                    if last_m.sender_type == models.SenderType.ARTIST
                    else "client"
                )

        # Counterparty
        if is_artist:
            other = br.client
            display = f"{other.first_name} {other.last_name}" if other else "Client"
            avatar_url = other.profile_picture_url if other else None
        else:
            other = br.artist
            display = f"{other.first_name} {other.last_name}" if other else "Artist"
            avatar_url = None
            if other:
                profile = other.artist_profile
                if profile and profile.business_name:
                    display = profile.business_name
                if profile and profile.profile_picture_url:
                    avatar_url = profile.profile_picture_url
                elif other.profile_picture_url:
                    avatar_url = other.profile_picture_url

        # State
        state = _state_from_status(br.status)

        preview = getattr(br, "last_message_content", "")
        preview_key = getattr(br, "_preview_key", None)
        preview_args = getattr(br, "_preview_args", None) or {}

        # Meta
        meta = {}
        # Include common, safe bits if present
        if getattr(br, "travel_breakdown", None):
            tb = br.travel_breakdown or {}
            city = tb.get("event_city") or tb.get("address") or tb.get("place_name")
            if city:
                meta["location"] = city
        if getattr(br, "proposed_datetime_1", None):
            meta["event_date"] = br.proposed_datetime_1

        items.append(
            ThreadPreviewItem(
                thread_id=br.id,
                counterparty=Counterparty(name=display, avatar_url=avatar_url),
                last_message_preview=preview or "",
                last_actor=last_actor,
                last_ts=last_ts,
                unread_count=unread_by_id.get(br.id, 0),
                state=state,
                meta=meta or None,
                pinned=False,
                preview_key=preview_key,
                preview_args=(preview_args or None),
            )
        )

    items.sort(key=lambda i: i.last_ts, reverse=True)
    return ThreadPreviewResponse(items=items, next_cursor=None)


# Unified threads index: server-side merged list with preview and unread
@router.get("/threads", response_model=ThreadsIndexResponse)
def get_threads_index(
    role: Optional[str] = Query(None, regex="^(artist|client)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return a unified threads index for the Inbox list.

    Includes counterparty, last_message_snippet, unread_count, state, and light metadata.
    Internally composes booking-request last message and notification unread counts.
    """
    is_artist = current_user.user_type == models.UserType.SERVICE_PROVIDER
    if role == "client":
        is_artist = False
    elif role == "artist":
        is_artist = True

    brs = crud_booking_request.get_booking_requests_with_last_message(
        db,
        artist_id=current_user.id if is_artist else None,
        client_id=current_user.id if not is_artist else None,
        skip=0,
        limit=limit,
    )
    # Map unread counts via notification aggregator for now
    threads = crud_notification.get_message_thread_notifications(db, current_user.id)
    unread_by_id: Dict[int, int] = {t["booking_request_id"]: int(t.get("unread_count", 0)) for t in threads}

    items: List[ThreadsIndexItem] = []
    for br in brs:
        last_m = getattr(br, "_last_message", None)
        last_ts = getattr(br, "last_message_timestamp", None) or br.created_at
        preview_key = getattr(br, "_preview_key", None)
        preview_args = getattr(br, "_preview_args", None) or {}

        # Counterparty name/avatar
        if is_artist:
            other = br.client
            name = f"{other.first_name} {other.last_name}" if other else "Client"
            avatar_url = other.profile_picture_url if other else None
        else:
            other = br.artist
            name = f"{other.first_name} {other.last_name}" if other else "Artist"
            avatar_url = None
            if other:
                profile = other.artist_profile
                if profile and profile.business_name:
                    name = profile.business_name
                if profile and profile.profile_picture_url:
                    avatar_url = profile.profile_picture_url
                elif other.profile_picture_url:
                    avatar_url = other.profile_picture_url

        state = _state_from_status(br.status)
        snippet = preview_label_for_message(last_m, thread_state=state, sender_display=name)

        meta: Dict[str, Any] = {}
        if getattr(br, "travel_breakdown", None):
            tb = br.travel_breakdown or {}
            city = tb.get("event_city") or tb.get("address") or tb.get("place_name")
            if city:
                meta["location"] = city
        if getattr(br, "proposed_datetime_1", None):
            meta["event_date"] = br.proposed_datetime_1

        items.append(
            ThreadsIndexItem(
                thread_id=br.id,
                booking_request_id=br.id,
                state=state,
                counterparty_name=name,
                counterparty_avatar_url=avatar_url,
                last_message_snippet=snippet or "",
                last_message_at=last_ts,
                unread_count=unread_by_id.get(br.id, 0),
                meta=meta or None,
                preview_key=preview_key,
                preview_args=(preview_args or None),
            )
        )

    items.sort(key=lambda i: i.last_message_at, reverse=True)
    return ThreadsIndexResponse(items=items, next_cursor=None)


@router.post("/message-threads/ensure-booka-thread")
def ensure_booka_thread(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Ensure a Booka thread exists for the current artist and contains the latest
    moderation message (approved/rejected) for one of their services.

    Returns a booking_request_id which the client can navigate to.
    """
    if current_user.user_type != models.UserType.SERVICE_PROVIDER:
        return {"booking_request_id": None}

    # Ensure Booka system user exists
    import os
    from sqlalchemy import func
    system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
    system_user = db.query(models.User).filter(func.lower(models.User.email) == system_email).first()
    if not system_user:
        try:
            system_user = models.User(
                email=system_email,
                password="!disabled-system-user!",
                first_name="Booka",
                last_name="",
                phone_number=None,
                is_active=True,
                is_verified=True,
                user_type=models.UserType.CLIENT,
            )
            db.add(system_user)
            db.commit()
            db.refresh(system_user)
        except Exception:
            db.rollback()

    # Find or create a dedicated Booka→Artist system thread (never reuse client threads)
    br = (
        db.query(models.BookingRequest)
        .filter(models.BookingRequest.artist_id == current_user.id)
        .filter(models.BookingRequest.client_id == (system_user.id if system_user else -1))
        .order_by(models.BookingRequest.created_at.desc())
        .first()
    )
    if not br and system_user:
        br = models.BookingRequest(
            client_id=system_user.id,
            artist_id=current_user.id,
            status=models.BookingStatus.PENDING_QUOTE,
        )
        db.add(br)
        db.commit()
        db.refresh(br)

    if not br:
        return {"booking_request_id": None}

    # Best-effort: find the most recently updated approved/rejected service
    s = (
        db.query(models.Service)
        .filter(models.Service.artist_id == current_user.id)
        .filter(models.Service.status.in_(["approved", "rejected"]))
        .order_by(models.Service.updated_at.desc() if hasattr(models.Service, 'updated_at') else models.Service.id.desc())
        .first()
    )

    if s is None:
        return {"booking_request_id": br.id}

    # Post system message if not already present
    from ..crud import crud_message
    key = f"listing_approved_v1:{s.id}" if s.status == "approved" else f"listing_rejected_v1:{s.id}"
    exists = (
        db.query(models.Message)
        .filter(models.Message.booking_request_id == br.id, models.Message.system_key == key)
        .first()
    )
    if not exists:
        if s.status == "approved":
            msg = (
                f"Listing approved: {s.title}\n"
                f"Congratulations! Your listing has been approved and is now live.\n"
                f"View listing: /services/{s.id}\n"
                f"Need help? Contact support at support@booka.co.za."
            )
        else:
            msg = (
                f"Listing rejected: {s.title}\n"
                f"Reason: No reason provided.\n"
                f"You can update your listing and resubmit.\n"
                f"View listing: /dashboard/artist?tab=services\n"
                f"Need help? Contact support at support@booka.co.za."
            )
        try:
            crud_message.create_message(
                db,
                booking_request_id=br.id,
                sender_id=(system_user.id if system_user else current_user.id),
                sender_type=models.SenderType.CLIENT,
                content=msg,
                message_type=models.MessageType.SYSTEM,
                visible_to=models.VisibleTo.BOTH,
                system_key=key,
            )
        except Exception:
            pass

    return {"booking_request_id": br.id}


class StartThreadPayload(BaseModel):
    artist_id: int
    service_id: Optional[int] = None
    message: Optional[str] = None
    proposed_date: Optional[str] = None  # ISO date or datetime
    guests: Optional[int] = None


@router.post("/message-threads/start", status_code=status.HTTP_201_CREATED)
def start_message_thread(
    payload: StartThreadPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_client),
):
    """Start a message-only thread with an artist and emit an inquiry card.

    Creates a lightweight booking_request container, then posts:
    1) an inquiry card (SYSTEM with system_key=inquiry_sent_v1)
    2) the user's first message (USER)

    Returns the booking_request_id to open in the inbox.
    """
    # Validate artist exists and is a service provider
    artist = (
        db.query(models.User)
        .filter(models.User.id == payload.artist_id, models.User.user_type == models.UserType.SERVICE_PROVIDER)
        .first()
    )
    if not artist:
        from ..utils import error_response
        raise error_response(
            "Artist not found",
            {"artist_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    # Validate service if provided
    svc = None
    if payload.service_id:
        svc = (
            db.query(models.Service)
            .filter(models.Service.id == payload.service_id, models.Service.artist_id == payload.artist_id)
            .first()
        )
        if not svc:
            from ..utils import error_response
            raise error_response(
                "Service ID does not match the specified artist or does not exist.",
                {"service_id": "invalid"},
                status.HTTP_400_BAD_REQUEST,
            )

    # Parse proposed date if present
    proposed_dt: Optional[datetime] = None
    if payload.proposed_date:
        try:
            proposed_dt = datetime.fromisoformat(payload.proposed_date.replace("Z", "+00:00"))
        except Exception:
            try:
                proposed_dt = datetime.strptime(payload.proposed_date, "%Y-%m-%d")
            except Exception:
                proposed_dt = None

    # Create a booking request container directly via CRUD (skip auto system messages)
    # Do NOT persist the initial user message on the booking_request.message field
    # to ensure the first chat bubble is visible (the UI hides duplicates).
    req_in = schemas.BookingRequestCreate(
        artist_id=payload.artist_id,
        service_id=payload.service_id,
        message=None,
        proposed_datetime_1=proposed_dt,
        status=models.BookingStatus.PENDING_QUOTE,
    )
    br = crud_booking_request.create_booking_request(db=db, booking_request=req_in, client_id=current_user.id)
    db.commit()
    db.refresh(br)

    # Compose inquiry card details
    title = None
    cover = None
    if svc:
        title = svc.title or None
        cover = getattr(svc, "media_url", None)
    if not title:
        prof = artist.artist_profile
        title = (prof.business_name if prof and prof.business_name else f"{artist.first_name} {artist.last_name}").strip()
    if not cover:
        prof = artist.artist_profile
        cover = (getattr(prof, "cover_photo_url", None) or getattr(prof, "profile_picture_url", None))

    card = {
        "inquiry_sent_v1": {
            "title": title or "Listing",
            "cover": cover,
            "view": f"/service-providers/{payload.artist_id}",
            "date": payload.proposed_date or None,
            "guests": payload.guests or None,
        }
    }

    # 1) Inquiry card first so the preview can prefer the user's text below
    try:
        crud_message.create_message(
            db,
            booking_request_id=br.id,
            sender_id=current_user.id,
            sender_type=models.SenderType.CLIENT,
            content=json.dumps(card),
            message_type=models.MessageType.SYSTEM,
            visible_to=models.VisibleTo.BOTH,
            system_key="inquiry_sent_v1",
        )
    except Exception:
        db.rollback()
        # Non-fatal; proceed

    # 2) First user message (if provided)
    if payload.message and payload.message.strip():
        try:
            crud_message.create_message(
                db,
                booking_request_id=br.id,
                sender_id=current_user.id,
                sender_type=models.SenderType.CLIENT,
                content=payload.message.strip(),
                message_type=models.MessageType.USER,
                visible_to=models.VisibleTo.BOTH,
            )
        except Exception:
            db.rollback()

    db.commit()
    return {"booking_request_id": br.id}


class InboxUnreadResponse(BaseModel):
    total: int


@router.get("/inbox/unread", response_model=InboxUnreadResponse, responses={304: {"description": "Not Modified"}})
def get_inbox_unread(
    response: Response,
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return total unread message notifications with lightweight ETag support."""

    total, latest_ts = crud_notification.get_unread_message_totals(db, current_user.id)
    marker = latest_ts.isoformat(timespec="seconds") if latest_ts else "0"
    etag_source = f"{current_user.id}:{total}:{marker}"
    etag_value = f'W/"{hashlib.sha1(etag_source.encode()).hexdigest()}"'

    if if_none_match and if_none_match.strip() == etag_value:
        response.status_code = status.HTTP_304_NOT_MODIFIED
        response.headers["ETag"] = etag_value
        return None

    response.headers["ETag"] = etag_value
    return InboxUnreadResponse(total=total)
