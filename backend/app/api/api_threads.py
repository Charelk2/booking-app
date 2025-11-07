from fastapi import APIRouter, Depends, Query, status, Response, Header
from fastapi.responses import ORJSONResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from typing import Any, Dict, List, Optional, Tuple

from .. import models
from ..schemas.threads import (
    ThreadPreviewItem,
    ThreadPreviewResponse,
    Counterparty,
)
from ..schemas.threads_index import ThreadsIndexItem, ThreadsIndexResponse
from .dependencies import get_db, get_current_user, get_current_active_client
from .. import schemas
from .. import crud
from ..utils.messages import preview_label_for_message
import re
import json
from pydantic import BaseModel
from datetime import datetime
import hashlib
import time

# ---- JSON encoder (orjson if available) -------------------------------------

try:
    import orjson as _orjson
    def _json_dumps(obj: Any) -> bytes:
        return _orjson.dumps(obj)
except Exception:  # pragma: no cover
    import json as _json
    def _json_dumps(obj: Any) -> bytes:
        def _default(o):
            if isinstance(o, datetime):
                return o.isoformat()
            return str(o)
        return _json.dumps(obj, default=_default).encode("utf-8")


router = APIRouter(tags=["threads"])


# ---- Helpers ----------------------------------------------------------------

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


def _change_token(prefix: str, user_id: int, last_msg_id: int, last_br_id: int, unread_total_or_sum: int, thread_count_or_items: int) -> str:
    """Monotonic, unified ETag token based on IDs and key counters.

    Using IDs avoids timestamp precision traps and guarantees change on inserts.
    Falls back to 0 where not available.
    """
    basis = f"{prefix}:{int(user_id)}:{int(last_msg_id)}:{int(last_br_id)}:{int(unread_total_or_sum)}:{int(thread_count_or_items)}"
    return f'W/"{hashlib.sha1(basis.encode()).hexdigest()}"'


def _coalesce_bool(v: Optional[str]) -> bool:
    if v is None:
        return False
    v = v.strip().lower()
    return v in ("1", "true", "yes", "y", "on")


# ---- /message-threads/preview -----------------------------------------------

@router.get(
    "/message-threads/preview",
    response_model=None,
    responses={304: {"description": "Not Modified"}},
)
def get_threads_preview(
    response: Response,
    role: Optional[str] = Query(None, pattern="^(artist|client)$"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = None,
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    x_after_write: Optional[str] = Header(default=None, alias="X-After-Write", convert_underscores=False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return atomic thread previews with unread counts (fast & consistent).

    Improvements:
    - Unified ETag based on IDs (no seconds truncation)
    - Identical ETag formula for pre-check and final response
    - Optional X-After-Write header to skip 304 pre-check right after writes
    """
    t_start = time.perf_counter()

    is_artist = current_user.user_type == models.UserType.SERVICE_PROVIDER
    if role == "client":
        is_artist = False
    elif role == "artist":
        is_artist = True

    skip_precheck = _coalesce_bool(x_after_write)

    # ---- ETag pre-check (cheap) --------------------------------------------
    etag_pre: Optional[str] = None
    if not skip_precheck:
        try:
            # Count threads for this user
            q_threads = db.query(models.BookingRequest.id)
            if is_artist:
                q_threads = q_threads.filter(models.BookingRequest.artist_id == current_user.id)
            else:
                q_threads = q_threads.filter(models.BookingRequest.client_id == current_user.id)
            thread_count = q_threads.count()

            # Max message id across user threads (finer than timestamp seconds)
            q_max_msg_id = (
                db.query(func.max(models.Message.id))
                .join(models.BookingRequest, models.Message.booking_request_id == models.BookingRequest.id)
            )
            if is_artist:
                q_max_msg_id = q_max_msg_id.filter(models.BookingRequest.artist_id == current_user.id)
            else:
                q_max_msg_id = q_max_msg_id.filter(models.BookingRequest.client_id == current_user.id)
            max_msg_id = int(q_max_msg_id.scalar() or 0)

            # Max booking request id across user's threads (captures new threads without messages)
            q_max_br_id = db.query(func.max(models.BookingRequest.id))
            if is_artist:
                q_max_br_id = q_max_br_id.filter(models.BookingRequest.artist_id == current_user.id)
            else:
                q_max_br_id = q_max_br_id.filter(models.BookingRequest.client_id == current_user.id)
            max_br_id = int(q_max_br_id.scalar() or 0)

            # Unread total for this user
            try:
                total_unread, _ = crud.crud_message.get_unread_message_totals_for_user(db, int(current_user.id))
            except Exception:
                total_unread = 0

            etag_pre = _change_token(
                "prev",
                current_user.id,
                max_msg_id,
                max_br_id,
                int(total_unread),
                int(thread_count),
            )

            if if_none_match and if_none_match.strip() == etag_pre:
                pre_ms = (time.perf_counter() - t_start) * 1000.0
                return Response(
                    status_code=status.HTTP_304_NOT_MODIFIED,
                    headers={"ETag": etag_pre, "Server-Timing": f"pre;dur={pre_ms:.1f}"}
                )
        except Exception:
            # Fall through to full compose on any error
            pass

    # ---- Main composition ---------------------------------------------------
    t_brs_start = time.perf_counter()
    viewer_role = models.VisibleTo.ARTIST if is_artist else models.VisibleTo.CLIENT

    # Windowed last message per thread (visible to viewer)
    win = (
        db.query(
            models.Message.booking_request_id.label("br_id"),
            models.Message.id.label("message_id"),
            models.Message.timestamp.label("msg_ts"),
            models.Message.content.label("msg_content"),
            models.Message.message_type.label("msg_type"),
            models.Message.sender_type.label("sender_type"),
            models.Message.visible_to.label("visible_to"),
            models.Message.system_key.label("system_key"),
            func.row_number()
            .over(
                partition_by=models.Message.booking_request_id,
                order_by=models.Message.timestamp.desc(),
            )
            .label("rn"),
        )
        .filter(models.Message.visible_to.in_([models.VisibleTo.BOTH, viewer_role]))
        .subquery()
    )

    last_msg = (
        db.query(
            win.c.br_id,
            win.c.message_id,
            win.c.msg_ts,
            win.c.msg_content,
            win.c.msg_type,
            win.c.sender_type,
            win.c.visible_to,
            win.c.system_key,
        )
        .filter(win.c.rn == 1)
        .subquery()
    )

    br_query = (
        db.query(
            models.BookingRequest,
            func.coalesce(last_msg.c.msg_ts, models.BookingRequest.created_at).label("last_ts"),
            last_msg.c.message_id,
            last_msg.c.msg_content,
            last_msg.c.msg_type,
            last_msg.c.sender_type,
            last_msg.c.visible_to,
            last_msg.c.system_key,
        )
        .outerjoin(last_msg, models.BookingRequest.id == last_msg.c.br_id)
        .options(
            selectinload(models.BookingRequest.client).load_only(
                models.User.id,
                models.User.first_name,
                models.User.last_name,
                models.User.profile_picture_url,
            ),
            selectinload(models.BookingRequest.artist)
            .load_only(
                models.User.id,
                models.User.first_name,
                models.User.last_name,
                models.User.profile_picture_url,
            )
            .selectinload(models.User.artist_profile)
            .load_only(
                models.ServiceProviderProfile.user_id,
                models.ServiceProviderProfile.business_name,
                models.ServiceProviderProfile.profile_picture_url,
            ),
            selectinload(models.BookingRequest.service).load_only(
                models.Service.id,
                models.Service.service_type,
            ),
        )
    )
    if is_artist:
        br_query = br_query.filter(models.BookingRequest.artist_id == current_user.id)
    else:
        br_query = br_query.filter(models.BookingRequest.client_id == current_user.id)

    rows: List[Tuple] = (
        br_query
        .order_by(func.coalesce(last_msg.c.msg_ts, models.BookingRequest.created_at).desc())
        .limit(limit)
        .all()
    )
    t_brs_ms = (time.perf_counter() - t_brs_start) * 1000.0

    # Unread counts for these threads
    t_unread_start = time.perf_counter()
    thread_ids = [int(br.id) for (br, *_rest) in rows]
    unread_by_id = crud.crud_message.get_unread_counts_for_user_threads(db, current_user.id, thread_ids=thread_ids)
    t_unread_ms = (time.perf_counter() - t_unread_start) * 1000.0

    # Build items
    t_build_start = time.perf_counter()
    items: List[Dict[str, Any]] = []

    # Paid PV filter (kept; consider denormalizing if hot)
    pv_ids = [int(br.id) for (br, *_r) in rows if ((getattr(br.service, "service_type", "") or "").lower() == "personalized video")]
    paid_pv_ids: set[int] = set()
    if pv_ids:
        try:
            paid_pv_ids = crud.crud_message.get_payment_received_booking_request_ids(db, pv_ids)
        except Exception:
            paid_pv_ids = set()

    # Determine first-row IDs for final ETag after build
    first_last_msg_id: int = 0
    first_last_br_id: int = 0

    for idx, (br, last_ts, msg_id, msg_content, msg_type, sender_type, visible_to, system_key) in enumerate(rows):
        # Defensive timestamp
        last_ts = last_ts or br.created_at or datetime.utcnow()

        # Skip unpaid PV
        service_type = (getattr(br.service, "service_type", "") or "").lower()
        if service_type == "personalized video" and int(br.id) not in paid_pv_ids:
            continue

        # Normalize enums if needed
        try:
            if msg_type is not None and not isinstance(msg_type, models.MessageType):
                msg_type = models.MessageType(str(msg_type))
        except Exception:
            pass
        try:
            if sender_type is not None and not isinstance(sender_type, models.SenderType):
                sender_type = models.SenderType(str(sender_type))
        except Exception:
            pass

        class _Msg:
            __slots__ = ("content", "message_type", "sender_type", "system_key")
            def __init__(self, c, mt, st, sk):
                self.content = c or ""
                self.message_type = mt
                self.sender_type = st
                self.system_key = sk

        last_m = _Msg(msg_content or "", msg_type, sender_type, system_key)
        last_actor = "system" if msg_type == models.MessageType.SYSTEM else (
            "artist" if sender_type == models.SenderType.ARTIST else "client"
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

        # Preview content
        preview = preview_label_for_message(last_m, thread_state=state, sender_display=display) if msg_id else ""
        preview_key = None
        preview_args: Dict[str, Any] = {}
        if system_key:
            sk = (system_key or "").strip().lower()
            if sk.startswith("booking_details"):
                preview_key = preview_key or "new_booking_request"
            elif sk.startswith("payment_received") or sk == "payment_received":
                preview_key = "payment_received"
            elif sk.startswith("event_reminder"):
                preview_key = "event_reminder"
                low = (msg_content or "").strip().lower()
                dm = re.search(r"event\s+in\s+(\d+)\s+days\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", low, flags=re.IGNORECASE)
                if dm:
                    preview_args = {"daysBefore": int(dm.group(1)), "date": dm.group(2)}

        # Meta
        meta: Dict[str, Any] = {}
        if getattr(br, "travel_breakdown", None):
            tb = br.travel_breakdown or {}
            city = tb.get("event_city") or tb.get("address") or tb.get("place_name")
            if city:
                meta["location"] = city
        if getattr(br, "proposed_datetime_1", None):
            meta["event_date"] = br.proposed_datetime_1

        items.append({
            "thread_id": int(br.id),
            "counterparty": {"name": display, "avatar_url": avatar_url},
            "last_message_preview": (preview or ""),
            "last_actor": last_actor,
            "last_ts": last_ts,
            "unread_count": int(unread_by_id.get(int(br.id), 0) or 0),
            "state": state,
            "meta": (meta or None),
            "pinned": False,
            "preview_key": preview_key,
            "preview_args": (preview_args or None),
        })

        # Track first-row ids for ETag (based on sorted order below; collect for idx==0 pre-sort alternative)
        if idx == 0:
            first_last_msg_id = int(msg_id or 0)
            first_last_br_id = int(br.id)

    # Sort by last_ts desc (kept)
    items.sort(key=lambda i: i["last_ts"], reverse=True)
    t_build_ms = (time.perf_counter() - t_build_start) * 1000.0

    # ---- Final ETag (same formula as pre-check) -----------------------------
    try:
        # We prefer the IDs from the *first* (latest) item; if empty, fall back to 0s
        if rows:
            # If sorting changed the first element, recompute IDs accordingly:
            top_thread_id = int(items[0]["thread_id"]) if items else 0
            # Find corresponding msg_id from rows for that thread
            top_msg_id = 0
            for (br, _lts, msg_id, *_rest) in rows:
                if int(br.id) == top_thread_id:
                    top_msg_id = int(msg_id or 0)
                    break
        else:
            top_thread_id = 0
            top_msg_id = 0

        unread_sum = sum(int((it.get("unread_count") or 0)) for it in items)
        etag = _change_token(
            "prev",
            current_user.id,
            int(top_msg_id),
            int(top_thread_id),
            int(unread_sum),
            int(len(items)),
        )
    except Exception:
        etag = None

    # ---- Serialize + headers ------------------------------------------------
    payload: Dict[str, Any] = {"items": items, "next_cursor": None}
    t_ser_start = time.perf_counter()
    body = _json_dumps(payload)
    t_ser_ms = (time.perf_counter() - t_ser_start) * 1000.0

    pre_ms = (t_brs_start - t_start) * 1000.0
    server_timing = f"pre;dur={pre_ms:.1f}, brs;dur={t_brs_ms:.1f}, unread;dur={t_unread_ms:.1f}, build;dur={t_build_ms:.1f}, ser;dur={t_ser_ms:.1f}"

    headers: Dict[str, str] = {"Server-Timing": server_timing, "Cache-Control": "no-cache"}
    if etag:
        headers["ETag"] = etag

    return Response(content=body, media_type="application/json", headers=headers)


# ---- /threads (unified index) -----------------------------------------------

@router.get("/threads", response_model=ThreadsIndexResponse, responses={304: {"description": "Not Modified"}})
def get_threads_index(
    response: Response,
    role: Optional[str] = Query(None, pattern="^(artist|client)$"),
    limit: int = Query(50, ge=1, le=200),
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    x_after_write: Optional[str] = Header(default=None, alias="X-After-Write", convert_underscores=False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return a unified threads index for the Inbox list with consistent ETag behavior."""
    is_artist = current_user.user_type == models.UserType.SERVICE_PROVIDER
    if role == "client":
        is_artist = False
    elif role == "artist":
        is_artist = True

    skip_precheck = _coalesce_bool(x_after_write)

    # ---- ETag pre-check (cheap) --------------------------------------------
    etag_pre: Optional[str] = None
    if not skip_precheck:
        try:
            # Count threads
            q_threads = db.query(models.BookingRequest.id)
            if is_artist:
                q_threads = q_threads.filter(models.BookingRequest.artist_id == current_user.id)
            else:
                q_threads = q_threads.filter(models.BookingRequest.client_id == current_user.id)
            thread_count = q_threads.count()

            # Max message id
            q_max_msg_id = (
                db.query(func.max(models.Message.id))
                .join(models.BookingRequest, models.Message.booking_request_id == models.BookingRequest.id)
            )
            if is_artist:
                q_max_msg_id = q_max_msg_id.filter(models.BookingRequest.artist_id == current_user.id)
            else:
                q_max_msg_id = q_max_msg_id.filter(models.BookingRequest.client_id == current_user.id)
            max_msg_id = int(q_max_msg_id.scalar() or 0)

            # Max booking request id
            q_max_br_id = db.query(func.max(models.BookingRequest.id))
            if is_artist:
                q_max_br_id = q_max_br_id.filter(models.BookingRequest.artist_id == current_user.id)
            else:
                q_max_br_id = q_max_br_id.filter(models.BookingRequest.client_id == current_user.id)
            max_br_id = int(q_max_br_id.scalar() or 0)

            # Unread total
            try:
                total_unread, _ = crud.crud_message.get_unread_message_totals_for_user(db, int(current_user.id))
            except Exception:
                total_unread = 0

            etag_pre = _change_token(
                "idx",
                current_user.id,
                max_msg_id,
                max_br_id,
                int(total_unread),
                int(thread_count),
            )
            if if_none_match and if_none_match.strip() == etag_pre:
                return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag_pre})
        except Exception:
            pass

    # ---- Compose ------------------------------------------------------------
    brs = crud.crud_booking_request.get_booking_requests_with_last_message(
        db,
        artist_id=current_user.id if is_artist else None,
        client_id=current_user.id if not is_artist else None,
        skip=0,
        limit=limit,
        include_relationships=False,
        viewer=(models.VisibleTo.ARTIST if is_artist else models.VisibleTo.CLIENT),
    )

    thread_ids = [int(br.id) for br in brs if getattr(br, 'id', None) is not None]
    unread_by_id = crud.crud_message.get_unread_counts_for_user_threads(db, current_user.id, thread_ids=thread_ids)

    items: List[ThreadsIndexItem] = []
    for br in brs:
        last_m = getattr(br, "_last_message", None)
        last_ts = getattr(br, "last_message_timestamp", None) or br.created_at or datetime.utcnow()
        preview_key = getattr(br, "_preview_key", None)
        preview_args = getattr(br, "_preview_args", None) or {}

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
        snippet = getattr(br, "last_message_content", "") or preview_label_for_message(
            last_m,
            thread_state=state,
            sender_display=name,
        )

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
                thread_id=int(br.id),
                booking_request_id=int(br.id),
                state=state,
                counterparty_name=name,
                counterparty_avatar_url=avatar_url,
                last_message_snippet=snippet or "",
                last_message_at=last_ts,
                unread_count=int(unread_by_id.get(int(br.id), 0) or 0),
                meta=meta or None,
                preview_key=preview_key,
                preview_args=(preview_args or None),
            )
        )

    items.sort(key=lambda i: i.last_message_at, reverse=True)

    # ---- Final ETag (same as pre-check) ------------------------------------
    try:
        if items:
            top_br_id = int(items[0].booking_request_id)
            # Need the latest message id for that thread; fetch cheaply
            latest_msg_id_q = (
                db.query(func.max(models.Message.id))
                .filter(models.Message.booking_request_id == top_br_id)
            )
            latest_msg_id = int(latest_msg_id_q.scalar() or 0)
        else:
            top_br_id = 0
            latest_msg_id = 0

        unread_sum = sum(int(it.unread_count or 0) for it in items)
        etag = _change_token(
            "idx",
            current_user.id,
            latest_msg_id,
            top_br_id,
            int(unread_sum),
            int(len(items)),
        )
    except Exception:
        etag = None

    if etag and if_none_match and if_none_match.strip() == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

    if etag:
        try:
            response.headers["ETag"] = etag
            response.headers["Cache-Control"] = "no-cache"
        except Exception:
            pass

    return ThreadsIndexResponse(items=items, next_cursor=None)


# ---- /message-threads/ensure-booka-thread -----------------------------------

@router.post("/message-threads/ensure-booka-thread")
def ensure_booka_thread(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Ensure a Booka thread exists for the current artist and contains the latest
    moderation message (approved/rejected) for one of their services.
    """
    if current_user.user_type != models.UserType.SERVICE_PROVIDER:
        return {"booking_request_id": None}

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

    s = (
        db.query(models.Service)
        .filter(models.Service.artist_id == current_user.id)
        .filter(models.Service.status.in_(["approved", "rejected"]))
        .order_by(models.Service.updated_at.desc() if hasattr(models.Service, 'updated_at') else models.Service.id.desc())
        .first()
    )

    if s is None:
        return {"booking_request_id": br.id}

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
            crud.crud_message.create_message(
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


# ---- /message-threads/start --------------------------------------------------

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
    """Start a message-only thread with an artist and emit an inquiry card."""
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

    proposed_dt: Optional[datetime] = None
    if payload.proposed_date:
        try:
            proposed_dt = datetime.fromisoformat(payload.proposed_date.replace("Z", "+00:00"))
        except Exception:
            try:
                proposed_dt = datetime.strptime(payload.proposed_date, "%Y-%m-%d")
            except Exception:
                proposed_dt = None

    req_in = schemas.BookingRequestCreate(
        artist_id=payload.artist_id,
        service_id=payload.service_id,
        message=None,
        proposed_datetime_1=proposed_dt,
        status=models.BookingStatus.PENDING_QUOTE,
    )
    br = crud.crud_booking_request.create_booking_request(db=db, booking_request=req_in, client_id=current_user.id)
    db.commit()
    db.refresh(br)

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

    try:
        crud.crud_message.create_message(
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

    if payload.message and payload.message.strip():
        try:
            crud.crud_message.create_message(
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
    return {"booking_request_id": int(br.id)}


# ---- /inbox/unread -----------------------------------------------------------

class InboxUnreadResponse(BaseModel):
    total: int


@router.get("/inbox/unread", response_model=InboxUnreadResponse, responses={304: {"description": "Not Modified"}})
def get_inbox_unread(
    response: Response,
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    x_after_write: Optional[str] = Header(default=None, alias="X-After-Write", convert_underscores=False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return total unread message notifications with lightweight ETag support.

    Improved to avoid seconds truncation and allow skipping pre-check after writes.
    """
    skip_precheck = _coalesce_bool(x_after_write)

    # Compute total and marker timestamp (we only have ts from CRUD here)
    total, latest_ts = crud.crud_message.get_unread_message_totals_for_user(db, current_user.id)
    # Use full-precision ISO (microseconds) when available
    marker = latest_ts.isoformat() if latest_ts else "0"

    etag_value = _change_token("unread", current_user.id, 0, 0, int(total), 1 if marker != "0" else 0)

    if not skip_precheck and if_none_match and if_none_match.strip() == etag_value:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag_value})

    response.headers["ETag"] = etag_value
    return InboxUnreadResponse(total=int(total))
