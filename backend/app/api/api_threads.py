from fastapi import APIRouter, Depends, Query, status, Response, Header
from starlette.responses import StreamingResponse
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
import os
from pydantic import BaseModel
from datetime import datetime
import hashlib
import time
import asyncio

from ..utils.json import dumps_bytes as _json_dumps
from ..utils.redis_cache import get_redis_client, cache_bytes, get_cached_bytes
from threading import BoundedSemaphore
from fastapi.concurrency import run_in_threadpool
from ..database import get_db_session
import random

try:
    import msgpack  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    msgpack = None


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


def _change_token(prefix: str, user_id: int, last_msg_id: int, last_br_id: int, unread_total: int, thread_count: int) -> str:
    """Monotonic, unified ETag token based on IDs and counters."""
    basis = f"{prefix}:{int(user_id)}:{int(last_msg_id)}:{int(last_br_id)}:{int(unread_total)}:{int(thread_count)}"
    return f'W/"{hashlib.sha1(basis.encode()).hexdigest()}"'


def _coalesce_bool(v: Optional[str]) -> bool:
    if v is None:
        return False
    v = v.strip().lower()
    return v in ("1", "true", "yes", "y", "on")


def _cheap_snapshot(db: Session, user_id: int, is_artist: bool) -> Tuple[int, int, int, int]:
    """Return (max_msg_id, max_br_id, unread_total, thread_count) for the user's inbox.

    Uses a single aggregate query for max_msg_id, max_br_id, and thread_count.
    Unread total uses the existing optimized helper for correctness.
    """
    viewer_role = models.VisibleTo.ARTIST if is_artist else models.VisibleTo.CLIENT
    br = models.BookingRequest
    msg = models.Message

    q = (
        db.query(
            func.coalesce(func.max(msg.id), 0),
            func.coalesce(func.max(br.id), 0),
            func.count(func.distinct(br.id)),
        )
        .select_from(br)
        .outerjoin(
            msg,
            (msg.booking_request_id == br.id)
            & (msg.visible_to.in_([models.VisibleTo.BOTH, viewer_role])),
        )
    )
    if is_artist:
        q = q.filter(br.artist_id == user_id)
    else:
        q = q.filter(br.client_id == user_id)
    try:
        max_msg_id, max_br_id, thread_count = q.one()
        max_msg_id = int(max_msg_id or 0)
        max_br_id = int(max_br_id or 0)
        thread_count = int(thread_count or 0)
    except Exception:
        max_msg_id, max_br_id, thread_count = 0, 0, 0

    try:
        unread_total, _ = crud.crud_message.get_unread_message_totals_for_user(db, int(user_id))
    except Exception:
        unread_total = 0

    return int(max_msg_id), int(max_br_id), int(unread_total), int(thread_count)


# ---- /message-threads/preview -----------------------------------------------

@router.get(
    "/message-threads/preview",
    response_model=None,
    responses={304: {"description": "Not Modified"}},
)
def get_threads_preview(
    response: Response,
    role: Optional[str] = Query(None, regex="^(artist|client)$"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = None,
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    x_after_write: Optional[str] = Header(default=None, alias="X-After-Write", convert_underscores=False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return atomic thread previews with unread counts (fast & consistent).

    Improvements:
    - Unified ID-based ETag (no seconds truncation)
    - Identical ETag formula for pre-check and final response
    - Optional X-After-Write header to skip 304 right after writes
    """
    t_start = time.perf_counter()
    is_artist = current_user.user_type == models.UserType.SERVICE_PROVIDER
    if role == "client":
        is_artist = False
    elif role == "artist":
        is_artist = True

    skip_precheck = _coalesce_bool(x_after_write)

    # ---- EARLY cache check (avoid any DB work on hits) ---------------------
    # If preview cache is enabled and we have a cached ETag/body for this
    # viewer/role/limit, try to satisfy the request immediately. This allows
    # 304 revalidation and 200 cached body responses without touching the DB.
    # Clients that just wrote can send X-After-Write to force a fresh check.
    try:
        cache_on_early = (os.getenv("PREVIEW_CACHE_ENABLED", "0").strip().lower() in {"1", "true", "yes"})
    except Exception:
        cache_on_early = False
    if cache_on_early and not skip_precheck:
        try:
            role_key_early = "artist" if is_artist else "client"
            base_key_early = f"preview:{int(current_user.id)}:{role_key_early}:{int(limit)}"
            etag_key_early = f"{base_key_early}:etag"
            body_key_early = f"{base_key_early}:body"
            client_early = get_redis_client()
            cached_etag_early = None
            try:
                cached_etag_early = client_early.get(etag_key_early)
            except Exception:
                cached_etag_early = None

            # If client's If-None-Match matches cached ETag, return 304 now.
            if if_none_match and cached_etag_early and if_none_match.strip() == str(cached_etag_early).strip():
                pre_ms = (time.perf_counter() - t_start) * 1000.0
                return Response(
                    status_code=status.HTTP_304_NOT_MODIFIED,
                    headers={
                        "ETag": str(cached_etag_early),
                        "Cache-Control": "no-cache, private",
                        "Vary": "If-None-Match, X-After-Write",
                        "Server-Timing": f"pre;dur={pre_ms:.1f}, pcache;desc=pre304",
                    },
                )

            # Otherwise, if we have a cached body, serve it immediately.
            cached_body_early = get_cached_bytes(body_key_early)
            if cached_etag_early and cached_body_early:
                pre_ms = (time.perf_counter() - t_start) * 1000.0
                return Response(
                    content=cached_body_early,
                    media_type="application/json",
                    headers={
                        "ETag": str(cached_etag_early),
                        "Cache-Control": "no-cache, private",
                        "Vary": "If-None-Match, X-After-Write",
                        "Server-Timing": f"pre;dur={pre_ms:.1f}, pcache;desc=hit-early",
                    },
                )
        except Exception:
            # Cache must never break the request path
            pass

    # Always compute the cheap snapshot once (shared by pre-check and final ETag)
    snap_max_msg_id, snap_max_br_id, snap_unread_total, snap_thread_count = _cheap_snapshot(db, int(current_user.id), is_artist)

    # ---- ETag pre-check (cheap) --------------------------------------------
    etag_pre = _change_token("prev", int(current_user.id), snap_max_msg_id, snap_max_br_id, snap_unread_total, snap_thread_count)
    if (not skip_precheck) and if_none_match and if_none_match.strip() == etag_pre:
        pre_ms = (time.perf_counter() - t_start) * 1000.0
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={
                "ETag": etag_pre,
                "Server-Timing": f"pre;dur={pre_ms:.1f}",
                "Cache-Control": "no-cache, private",
                "Vary": "If-None-Match, X-After-Write",
            }
        )

    # ---- Preview cache (read-fast path) ------------------------------------
    try:
        cache_on = (os.getenv("PREVIEW_CACHE_ENABLED", "0").strip().lower() in {"1", "true", "yes"})
    except Exception:
        cache_on = False
    if cache_on and not skip_precheck:
        try:
            role_key = "artist" if is_artist else "client"
            base_key = f"preview:{int(current_user.id)}:{role_key}:{int(limit)}"
            etag_key = f"{base_key}:etag"
            body_key = f"{base_key}:body"
            client = get_redis_client()
            cached_etag = None
            try:
                cached_etag = client.get(etag_key)
            except Exception:
                cached_etag = None
            if cached_etag and str(cached_etag).strip() == etag_pre:
                cached_body = get_cached_bytes(body_key)
                if cached_body:
                    pre_ms = (time.perf_counter() - t_start) * 1000.0
                    headers = {
                        "ETag": etag_pre,
                        "Cache-Control": "no-cache, private",
                        "Vary": "If-None-Match, X-After-Write",
                        "Server-Timing": f"pre;dur={pre_ms:.1f}, pcache;desc=hit",
                    }
                    return Response(content=cached_body, media_type="application/json", headers=headers)
        except Exception:
            # Cache must never break the request path
            pass

    # ---- Main composition ---------------------------------------------------
    t_brs_start = time.perf_counter()
    viewer_role = models.VisibleTo.ARTIST if is_artist else models.VisibleTo.CLIENT

    # Windowed last visible message per thread
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

    # Protect DB from preview storms under load
    _sem = _get_preview_sem()
    _sem.acquire()
    try:
        rows: List[Tuple] = (
            br_query
            .order_by(func.coalesce(last_msg.c.msg_ts, models.BookingRequest.created_at).desc())
            .limit(limit)
            .all()
        )
    finally:
        try: _sem.release()
        except Exception: pass
    t_brs_ms = (time.perf_counter() - t_brs_start) * 1000.0

    # Unread counts for these threads
    t_unread_start = time.perf_counter()
    thread_ids = [int(br.id) for (br, *_rest) in rows]
    unread_by_id = crud.crud_message.get_unread_counts_for_user_threads(db, current_user.id, thread_ids=thread_ids)
    t_unread_ms = (time.perf_counter() - t_unread_start) * 1000.0

    # Build items
    t_build_start = time.perf_counter()
    items: List[Dict[str, Any]] = []

    # Paid PV filter (consider denormalizing off hot path)
    pv_ids = [int(br.id) for (br, *_r) in rows if ((getattr(br.service, "service_type", "") or "").lower() == "personalized video")]
    paid_pv_ids: set[int] = set()
    if pv_ids:
        try:
            paid_pv_ids = crud.crud_message.get_payment_received_booking_request_ids(db, pv_ids)
        except Exception:
            paid_pv_ids = set()

    for (br, last_ts, msg_id, msg_content, msg_type, sender_type, visible_to, system_key) in rows:
        last_ts = last_ts or br.created_at or datetime.utcnow()

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

        # Preview label
        # Always delegate to preview_label_for_message so that brand-new
        # requested threads without any messages still get a stable,
        # neutral label like "New Booking Request" instead of an empty
        # preview that would overwrite hydrated client hints.
        preview_msg = last_m if msg_id else None
        preview = preview_label_for_message(preview_msg, thread_state=state, sender_display=display)
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
        # For threads with no messages yet that are still in the requested
        # state, surface a semantic preview_key so clients can render a
        # consistent badge/tag for new booking requests without relying on
        # content heuristics.
        if not system_key and not msg_id and state == "requested" and (preview or "").strip():
            preview_key = preview_key or "new_booking_request"

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

    items.sort(key=lambda i: i["last_ts"], reverse=True)
    t_build_ms = (time.perf_counter() - t_build_start) * 1000.0

    # ---- Final ETag (same token as pre-check) --------------------------------
    etag = _change_token("prev", int(current_user.id), snap_max_msg_id, snap_max_br_id, snap_unread_total, snap_thread_count)

    # ---- Serialize + headers -------------------------------------------------
    payload: Dict[str, Any] = {"items": items, "next_cursor": None}
    t_ser_start = time.perf_counter()
    body_json = _json_dumps(payload)
    t_ser_ms = (time.perf_counter() - t_ser_start) * 1000.0

    pre_ms = (t_brs_start - t_start) * 1000.0
    server_timing = f"pre;dur={pre_ms:.1f}, brs;dur={t_brs_ms:.1f}, unread;dur={t_unread_ms:.1f}, build;dur={t_build_ms:.1f}, ser;dur={t_ser_ms:.1f}"

    headers: Dict[str, str] = {
        "Server-Timing": server_timing,
        "Cache-Control": "no-cache, private",
        "Vary": "If-None-Match, X-After-Write",
        "ETag": etag,
    }

    # Optional MessagePack encoding for inbox preview (opt-in via env + library)
    body: bytes | str = body_json
    media_type = "application/json"
    allow_msgpack = os.getenv("ENABLE_THREAD_PREVIEW_MSGPACK", "0").strip().lower() in {"1", "true", "yes"}
    if allow_msgpack and msgpack:
        try:
            body = msgpack.dumps(payload, use_bin_type=True)
            media_type = "application/msgpack"
        except Exception:
            body = body_json
            media_type = "application/json"

    # Write to cache for subsequent requests (best-effort)
    try:
        if cache_on:
            role_key = "artist" if is_artist else "client"
            base_key = f"preview:{int(current_user.id)}:{role_key}:{int(limit)}"
            etag_key = f"{base_key}:etag"
            body_key = f"{base_key}:body"
            # TTL with small jitter to avoid cache stampedes
            try:
                ttl = int(os.getenv("PREVIEW_CACHE_TTL", "30") or 30)
            except Exception:
                ttl = 30
            try:
                jitter = float(os.getenv("PREVIEW_CACHE_JITTER", "0.1") or 0.1)
            except Exception:
                jitter = 0.1
            ttl_j = max(5, int(ttl + random.uniform(-ttl * jitter, ttl * jitter)))
            client = get_redis_client()
            try:
                client.setex(etag_key, ttl_j, etag)
            except Exception:
                pass
            try:
                cache_bytes(body_key, body if isinstance(body, (bytes, bytearray)) else body_json, ttl_j)
            except Exception:
                pass
    except Exception:
        pass

    return Response(content=body, media_type=media_type, headers=headers)


# ---- /threads (unified index) -----------------------------------------------

@router.get("/threads", response_model=None, responses={304: {"description": "Not Modified"}})
def get_threads_index(
    response: Response,
    role: Optional[str] = Query(None, regex="^(artist|client)$"),
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

    # Cheap snapshot used both for pre-check and final ETag
    snap_max_msg_id, snap_max_br_id, snap_unread_total, snap_thread_count = _cheap_snapshot(db, int(current_user.id), is_artist)
    etag_pre = _change_token("idx", int(current_user.id), snap_max_msg_id, snap_max_br_id, snap_unread_total, snap_thread_count)
    if (not skip_precheck) and if_none_match and if_none_match.strip() == etag_pre:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={
            "ETag": etag_pre,
            "Cache-Control": "no-cache, private",
            "Vary": "If-None-Match, X-After-Write",
        })

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

    etag_final = _change_token("idx", int(current_user.id), snap_max_msg_id, snap_max_br_id, snap_unread_total, snap_thread_count)
    if if_none_match and if_none_match.strip() == etag_final:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={
            "ETag": etag_final,
            "Cache-Control": "no-cache, private",
            "Vary": "If-None-Match, X-After-Write",
        })

    payload = {
        "items": [
            {
                "thread_id": it.thread_id,
                "booking_request_id": it.booking_request_id,
                "state": it.state,
                "counterparty_name": it.counterparty_name,
                "counterparty_avatar_url": it.counterparty_avatar_url,
                "last_message_snippet": it.last_message_snippet,
                "last_message_at": it.last_message_at,
                "unread_count": it.unread_count,
                "meta": it.meta,
                "preview_key": getattr(it, "preview_key", None),
                "preview_args": getattr(it, "preview_args", None),
            }
            for it in items
        ],
        "next_cursor": None,
    }
    headers = {
        "ETag": etag_final,
        "Cache-Control": "no-cache, private",
        "Vary": "If-None-Match, X-After-Write",
    }
    allow_msgpack = os.getenv("ENABLE_THREAD_PREVIEW_MSGPACK", "0").strip().lower() in {"1", "true", "yes"}
    body_json = _json_dumps(payload)
    if allow_msgpack and msgpack:
        try:
            body = msgpack.dumps(payload, use_bin_type=True)
            return Response(content=body, media_type="application/msgpack", headers=headers)
        except Exception:
            pass
    return Response(content=body_json, media_type="application/json", headers=headers)


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


@router.get("/inbox/unread", response_model=None, responses={304: {"description": "Not Modified"}})
def get_inbox_unread(
    response: Response,
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    x_after_write: Optional[str] = Header(default=None, alias="X-After-Write", convert_underscores=False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return total unread message notifications with lightweight ETag support."""
    skip_precheck = _coalesce_bool(x_after_write)

    total, latest_ts = crud.crud_message.get_unread_message_totals_for_user(db, current_user.id)
    # full precision iso (no timespec truncation)
    marker = latest_ts.isoformat() if latest_ts else "0"
    etag_value = f'W/"{hashlib.sha1(f"{current_user.id}:{int(total)}:{marker}".encode()).hexdigest()}"'

    if (not skip_precheck) and if_none_match and if_none_match.strip() == etag_value:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={
            "ETag": etag_value,
            "Cache-Control": "no-cache, private",
            "Vary": "If-None-Match, X-After-Write",
        })

    payload = {"total": int(total)}
    headers = {
        "ETag": etag_value,
        "Cache-Control": "no-cache, private",
        "Vary": "If-None-Match, X-After-Write",
    }
    return Response(content=_json_dumps(payload), media_type="application/json", headers=headers)


# ---- Realtime: Server-Sent Events (SSE) -------------------------------------

@router.get("/inbox/stream")
async def inbox_stream(
    role: Optional[str] = Query(None, regex="^(artist|client)$"),
    heartbeat: float = Query(20.0, ge=5.0, le=120.0, description="Heartbeat seconds to keep proxy connections alive"),
    current_user: models.User = Depends(get_current_user),
):
    """Push minimal change events when the user's inbox state changes.

    Implementation: cheap polling of the snapshot every ~1s (non-blocking for clients).
    For ultra-low latency & scale, pair this with Postgres NOTIFY triggers (see SQL below).
    """
    is_artist = current_user.user_type == models.UserType.SERVICE_PROVIDER
    if role == "client":
        is_artist = False
    elif role == "artist":
        is_artist = True

    user_id = int(current_user.id)

    # Concurrency guard for stream snapshot DB touches
    global _STREAM_SEM
    sem = _get_stream_sem()

    def _snapshot_once(uid: int, as_artist: bool) -> Tuple[int, int, int, int]:
        with get_db_session() as _db:
            return _cheap_snapshot(_db, uid, as_artist)

    async def _poll_snapshot(uid: int, as_artist: bool) -> Tuple[int, int, int, int]:
        sem.acquire()
        try:
            return await run_in_threadpool(_snapshot_once, uid, as_artist)
        finally:
            try:
                sem.release()
            except Exception:
                pass

    async def _aiter_events():
        # Initial snapshot/token
        max_msg_id, max_br_id, unread_total, thread_count = await _poll_snapshot(user_id, is_artist)
        token = _change_token("snap", user_id, max_msg_id, max_br_id, unread_total, thread_count)
        last_emit_ts = time.time()

        # Send an initial event
        first_payload = {"token": token, "max_msg_id": max_msg_id, "max_br_id": max_br_id, "unread_total": unread_total, "thread_count": thread_count}
        yield f"event: hello\ndata: {json.dumps(first_payload)}\n\n"

        while True:
            # Heartbeat for proxies (Cloudflare/Fly/Nginx)
            now = time.time()
            if (now - last_emit_ts) >= heartbeat:
                yield f": keepalive {int(now)}\n\n"
                last_emit_ts = now

            # Poll snapshot cheaply
            new_max_msg_id, new_max_br_id, new_unread_total, new_thread_count = await _poll_snapshot(user_id, is_artist)
            new_token = _change_token("snap", user_id, new_max_msg_id, new_max_br_id, new_unread_total, new_thread_count)

            if new_token != token:
                payload = {
                    "token": new_token,
                    "max_msg_id": new_max_msg_id,
                    "max_br_id": new_max_br_id,
                    "unread_total": new_unread_total,
                    "thread_count": new_thread_count,
                }
                yield f"event: update\ndata: {json.dumps(payload)}\n\n"
                token = new_token
                last_emit_ts = time.time()

            # Non-blocking delay between polls
            await asyncio.sleep(1.0)  # tune between 0.5–2.0

    return StreamingResponse(_aiter_events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, private",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Nginx: disable response buffering
        "Vary": "Authorization, Cookie",  # Per-user stream
    })

# Stream DB semaphore (protects pool under many open streams)
_STREAM_SEM: BoundedSemaphore | None = None


def _get_stream_sem() -> BoundedSemaphore:
    global _STREAM_SEM
    if _STREAM_SEM is None:
        try:
            limit = int(os.getenv("INBOX_STREAM_CONCURRENCY") or 16)
            if limit <= 0:
                limit = 16
        except Exception:
            limit = 16
        _STREAM_SEM = BoundedSemaphore(limit)
    return _STREAM_SEM
_PREVIEW_SEM: BoundedSemaphore | None = None


def _get_preview_sem() -> BoundedSemaphore:
    global _PREVIEW_SEM
    if _PREVIEW_SEM is None:
        try:
            limit = int(os.getenv("THREADS_PREVIEW_CONCURRENCY") or 32)
            if limit <= 0:
                limit = 32
        except Exception:
            limit = 32
        _PREVIEW_SEM = BoundedSemaphore(limit)
    return _PREVIEW_SEM
