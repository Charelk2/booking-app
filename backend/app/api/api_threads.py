from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Dict, List, Optional

from .. import models
from ..schemas.threads import (
    ThreadPreviewItem,
    ThreadPreviewResponse,
    Counterparty,
)
from .dependencies import get_db, get_current_user
from ..crud import crud_booking_request, crud_notification, crud_message
from ..utils.messages import BOOKING_DETAILS_PREFIX, preview_label_for_message
from ..crud import crud_message
import re

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
        # Last message row (to infer last_actor more reliably)
        last_m = crud_message.get_last_message_for_request(db, br.id)
        last_ts = getattr(br, "last_message_timestamp", None) or br.created_at
        last_actor = "system"
        if last_m:
            if last_m.message_type == models.MessageType.SYSTEM:
                last_actor = "system"
            else:
                last_actor = "artist" if last_m.sender_type == models.SenderType.ARTIST else "client"

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

        # Preview label (PV-aware)
        service_type = (getattr(br.service, "service_type", "") or "").lower()
        is_pv = service_type == "personalized video".lower()
        if is_pv:
            def _is_skip(msg) -> bool:
                if not msg or not getattr(msg, "content", None):
                    return False
                text = (msg.content or "").strip()
                low = text.lower()
                if text.startswith(BOOKING_DETAILS_PREFIX):
                    return True
                if "you have a new booking request" in low:
                    return True
                return False

            candidate = last_m
            if _is_skip(candidate):
                viewer = models.VisibleTo.ARTIST if is_artist else models.VisibleTo.CLIENT
                try:
                    msgs = crud_message.get_messages_for_request(db, br.id, viewer=viewer, skip=0, limit=200)
                    for m in reversed(msgs):
                        if not _is_skip(m):
                            candidate = m
                            break
                except Exception:
                    pass

            if candidate is not None:
                text = (candidate.content or "").strip()
                low = text.lower()
                if low.startswith("payment received"):
                    m = re.search(r"order\s*#\s*([A-Za-z0-9\-]+)", text, flags=re.IGNORECASE)
                    order = f" — order #{m.group(1)}" if m else ""
                    preview = f"Payment received{order} · View receipt"
                elif "brief completed" in low:
                    preview = "Brief completed"
                else:
                    preview = preview_label_for_message(candidate, thread_state=state, sender_display=display)
            else:
                preview = preview_label_for_message(last_m, thread_state=state, sender_display=display)
        else:
            # Non-PV threads use shared helper
            preview = preview_label_for_message(last_m, thread_state=state, sender_display=display)

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
            )
        )

    items.sort(key=lambda i: i.last_ts, reverse=True)
    return ThreadPreviewResponse(items=items, next_cursor=None)
