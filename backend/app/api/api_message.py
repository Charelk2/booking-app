from fastapi import (
    APIRouter,
    Depends,
    status,
    UploadFile,
    File,
    BackgroundTasks,
    Query,
    Path,
    Request,
    Response,
    Header,
)
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Literal
from datetime import datetime, timezone
import logging
import time

from .. import crud, models, schemas
from ..schemas.storage import PresignIn, PresignOut
from .dependencies import get_db, get_current_user
from ..utils.notifications import (
    notify_user_new_message,
    notify_user_new_booking_request,
    VIDEO_FLOW_READY_MESSAGE,
    notify_quote_requested,
)
from ..utils.messages import BOOKING_DETAILS_PREFIX, preview_label_for_message
from ..utils import error_response
from ..utils import r2 as r2utils
from .api_ws import manager, notifications_manager, Envelope
from ..utils.metrics import incr as metrics_incr
import os
import mimetypes
import uuid
import shutil
from pydantic import BaseModel
try:  # optional for tooling environments
    import orjson as _orjson  # type: ignore
    def _json_dumps(obj):
        return _orjson.dumps(obj)
except Exception:  # pragma: no cover - fallback to stdlib json
    import json as _json  # type: ignore
    def _json_dumps(obj):
        def _default(o):
            if isinstance(o, datetime):
                return o.isoformat()
            try:
                return str(o)
            except Exception:
                return None
        return _json.dumps(obj, default=_default).encode("utf-8")
from ..utils.outbox import enqueue_outbox

router = APIRouter(tags=["messages"])

logger = logging.getLogger(__name__)

# In-memory idempotency cache for message create
_IDEMPOTENCY_CACHE: dict[str, tuple[int, float]] = {}
_IDEMPOTENCY_TTL_MS = 60_000  # 60 seconds

def _idemp_cache_key(request_id: int, sender_id: int, key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    try:
        k = key.strip()
        if not k:
            return None
        return f"{int(request_id)}:{int(sender_id)}:{k}"
    except Exception:
        return None

def _idemp_cache_get(k: Optional[str]) -> Optional[int]:
    if not k:
        return None
    try:
        rec = _IDEMPOTENCY_CACHE.get(k)
        if not rec:
            return None
        msg_id, exp = rec
        now_ms = time.time() * 1000.0
        if exp <= now_ms:
            try:
                _IDEMPOTENCY_CACHE.pop(k, None)
            except Exception:
                pass
            return None
        return int(msg_id)
    except Exception:
        return None

def _idemp_cache_put(k: Optional[str], message_id: int) -> None:
    if not k:
        return
    try:
        # opportunistic cleanup to bound size
        if len(_IDEMPOTENCY_CACHE) > 1000:
            now_ms = time.time() * 1000.0
            stale = [kk for kk, (_, exp) in _IDEMPOTENCY_CACHE.items() if exp <= now_ms]
            for kk in stale[:200]:
                _IDEMPOTENCY_CACHE.pop(kk, None)
        _IDEMPOTENCY_CACHE[k] = (int(message_id), (time.time() * 1000.0) + _IDEMPOTENCY_TTL_MS)
    except Exception:
        pass

DEFAULT_ATTACHMENTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "static", "attachments")
)
ATTACHMENTS_DIR = os.getenv("ATTACHMENTS_DIR", DEFAULT_ATTACHMENTS_DIR)
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)


# ---- ETag / helpers (align with api_threads) --------------------------------

def _coalesce_bool(v: Optional[str]) -> bool:
    if v is None:
        return False
    try:
        return str(v).strip().lower() in {"1", "true", "yes", "on", "y"}
    except Exception:
        return False


def _change_token(prefix: str, *parts: object) -> str:
    try:
        import hashlib
        basis = f"{prefix}:" + ":".join(str(int(p)) if isinstance(p, int) else str(p) for p in parts)
        return f'W/"{hashlib.sha1(basis.encode()).hexdigest()}"'
    except Exception:
        return f'W/"{prefix}-0"'


def _cheap_snapshot_thread(db: Session, request_id: int, viewer: "models.VisibleTo") -> tuple[int, int]:
    try:
        q = (
            db.query(func.max(models.Message.id), func.count(models.Message.id))
            .filter(models.Message.booking_request_id == int(request_id))
            .filter(models.Message.visible_to.in_([models.VisibleTo.BOTH, viewer]))
        )
        max_id, cnt = q.first() or (0, 0)
        return int(max_id or 0), int(cnt or 0)
    except Exception:
        return 0, 0


@router.get(
    "/booking-requests/{request_id}/messages",
    response_model=schemas.MessageListResponse,
)
def read_messages(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=5000),
    after_id: Optional[int] = Query(
        None,
        description="Return only messages with an id greater than this value",
    ),
    before_id: Optional[int] = Query(
        None,
        description="Return only messages with an id less than this value (older history)",
    ),
    fields: Optional[str] = Query(
        None, description="Comma-separated fields to include in the response"
    ),
    mode: Literal["full", "lite", "delta"] = Query(
        "full", description="full returns the legacy payload, lite trims optional fields, delta is optimized for after_id fetches"
    ),
    since: Optional[datetime] = Query(
        None,
        description="ISO datetime: include messages with timestamp >= since; primarily used with mode=delta",
    ),
    include_quotes: bool = Query(
        False,
        description="When true, include lightweight quote summaries keyed by quote_id to eliminate a follow-up fetch on first paint.",
    ),
    known_quote_ids: Optional[str] = Query(
        None,
        description="Comma-separated list of quote IDs already known to the client; server will omit these from the quotes map to reduce payload.",
    ),
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    x_after_write: Optional[str] = Header(default=None, alias="X-After-Write", convert_underscores=False),
    request: Request = None,
    response: Response = None,
):
    booking_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not booking_request:
        raise error_response(
            "Booking request not found",
            {"request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response(
            "Not authorized to access messages",
            {},
            status.HTTP_403_FORBIDDEN,
        )
    viewer = (
        models.VisibleTo.CLIENT
        if current_user.id == booking_request.client_id
        else models.VisibleTo.ARTIST
    )
    if after_id is not None and after_id < 0:
        after_id = None
    if hasattr(skip, "default"):
        skip = skip.default
    if hasattr(limit, "default"):
        limit = limit.default
    if hasattr(fields, "default"):
        fields = None

    normalized_mode: Literal["full", "lite", "delta"] = mode
    if normalized_mode == "delta" and after_id is None and since is None:
        # Delta without a cursor degrades to lite to avoid returning duplicate history
        normalized_mode = "lite"

    # Clamp heavy pages to keep p95 low and avoid starving health checks
    requested_limit = int(limit)
    if normalized_mode == "delta":
        # Delta pages should be small; align with (booking_request_id, id) index
        effective_limit = min(requested_limit, 100)
    else:
        # Initial/lite/full pages: cap to a reasonable window
        effective_limit = min(requested_limit, 120)
    # Always over-fetch by 1 so we can compute has_more uniformly across modes
    query_limit = effective_limit + 1

    request_start = time.perf_counter()
    db_latency_ms: float = 0.0

    # ETag pre-check using a cheap snapshot (skip when X-After-Write present)
    try:
        skip_pre = _coalesce_bool(x_after_write)
        viewer_label = "artist" if viewer == models.VisibleTo.ARTIST else "client"
        snap_max_id, snap_count = _cheap_snapshot_thread(db, int(request_id), viewer)
        etag_pre = _change_token(
            "msg",
            int(request_id), viewer_label, normalized_mode,
            int(after_id) if after_id is not None else "-",
            int(before_id) if before_id is not None else "-",
            int(effective_limit), snap_max_id, snap_count,
        )
        if (not skip_pre) and if_none_match and if_none_match.strip() == etag_pre:
            pre_ms = (time.perf_counter() - request_start) * 1000.0
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={
                "ETag": etag_pre,
                "Cache-Control": "no-cache, private",
                "Vary": "If-None-Match, X-After-Write",
                "Server-Timing": f"pre;dur={pre_ms:.1f}",
            })
    except Exception:
        etag_pre = None  # type: ignore
        snap_max_id = 0  # type: ignore
        snap_count = 0  # type: ignore

    try:
        query_start = time.perf_counter()
        newest_first = after_id is None and before_id is None and since is None
        db_messages = crud.crud_message.get_messages_for_request(
            db,
            request_id,
            viewer,
            skip=skip,
            limit=query_limit,
            after_id=after_id,
            before_id=before_id,
            since=since,
            newest_first=newest_first,
        )
        db_latency_ms = (time.perf_counter() - query_start) * 1000.0
    except Exception as exc:
        # Defensive logging to diagnose unexpected DB shape mismatches in the field
        from sqlalchemy import inspect

        try:
            insp = inspect(db.get_bind())
            cols: List[str] = []
            if "messages" in insp.get_table_names():
                cols = [c["name"] for c in insp.get_columns("messages")]
            logger.exception(
                "Failed to load messages for request %s; columns=%s error=%s",
                request_id,
                cols,
                exc,
            )
        except Exception:
            logger.exception("Failed to inspect messages table after error: %s", exc)

        total_latency_ms = (time.perf_counter() - request_start) * 1000.0
        envelope = schemas.MessageListResponse(
            mode=normalized_mode,
            items=[],
            has_more=False,
            next_cursor=None,
            delta_cursor=None,
            requested_after_id=after_id,
            requested_since=since,
            total_latency_ms=round(total_latency_ms, 2),
            db_latency_ms=round(db_latency_ms, 2),
            payload_bytes=0,
        )
        return envelope

    # Normalize all responses to oldest→newest for the client
    # - First page (newest_first): DB returned newest→oldest → reverse
    # - Before-cursor page: we ordered by id DESC for efficiency → reverse
    if 'newest_first' in locals() and newest_first:
        try:
            db_messages = list(reversed(db_messages))
        except Exception:
            pass
    elif before_id is not None:
        try:
            db_messages = list(reversed(db_messages))
        except Exception:
            pass

    has_more = False
    if len(db_messages) > effective_limit:
        has_more = True
        db_messages = db_messages[:effective_limit]

    lite_base_fields = {
        "id",
        "booking_request_id",
        "sender_id",
        "sender_type",
        "message_type",
        "visible_to",
        "content",
        "quote_id",
        "attachment_url",
        "timestamp",
        "system_key",
        "action",
        "is_read",
        "reply_to_message_id",
        "avatar_url",
        "preview_label",
        "preview_key",
    }
    delta_extra_fields = {"reactions", "my_reactions"}

    include: Optional[set[str]] = None
    if normalized_mode == "lite":
        include = set(lite_base_fields)
    elif normalized_mode == "delta":
        include = set(lite_base_fields | delta_extra_fields)

    if fields:
        extras = {f.strip() for f in fields.split(",") if f.strip()}
        base_for_fields = {
            "id",
            "booking_request_id",
            "sender_id",
            "sender_type",
            "message_type",
            "visible_to",
            "content",
            "is_read",
            "timestamp",
            "avatar_url",
            "attachment_url",
            "attachment_meta",
        }
        include = include or set()
        include.update(base_for_fields)
        include.update(extras)

    # Reactions inclusion rules:
    # - In non-"lite" modes, include by default unless the caller restricts fields and omits them
    # - In "lite" mode, include only when explicitly requested via fields
    if include is not None:
        include_reactions = ("reactions" in include) or ("my_reactions" in include)
    else:
        include_reactions = normalized_mode != "lite"
    include_reply_preview = normalized_mode == "full"
    if include and "reply_to_preview" in include:
        include_reply_preview = True
    include_attachment_meta = normalized_mode == "full"
    if include and "attachment_meta" in include:
        include_attachment_meta = True
    include_preview_args = normalized_mode == "full"
    if include and "preview_args" in include:
        include_preview_args = True

    # Preload reactions for all messages (best-effort)
    ids = [m.id for m in db_messages]
    if ids and include_reactions:
        try:
            aggregates = crud.crud_message_reaction.get_reaction_aggregates(db, ids)
            my = crud.crud_message_reaction.get_user_reactions(db, ids, current_user.id)
        except Exception:
            aggregates = {}
            my = {}
    else:
        aggregates = {}
        my = {}

    # Avoid sending large base64 avatars over the wire
    def _scrub_avatar(val: Optional[str]) -> Optional[str]:
        try:
            if isinstance(val, str) and val.startswith("data:") and len(val) > 1000:
                # Fallback to a lightweight default avatar served via static
                return "/static/default-avatar.svg"
        except Exception:
            pass
        return val

    def _scrub_attachment_meta(val: Optional[dict]) -> Optional[dict]:
        if not isinstance(val, dict):
            return val
        try:
            cleaned = {
                key: value
                for key, value in val.items()
                if key not in {
                    "data_url",
                    "dataUrl",
                    "preview",
                    "preview_base64",
                    "previewBase64",
                    "preview_data_url",
                }
            }
            thumb = cleaned.get("thumbnail")
            if isinstance(thumb, str) and thumb.startswith("data:") and len(thumb) > 200:
                cleaned.pop("thumbnail", None)
            return cleaned or None
        except Exception:
            return None

    # Helper: transform attachment_url to a signed GET if it's an R2 public URL
    # Skip signing for images so browsers can cache on a stable public URL.
    def _maybe_sign_attachment_url(val: Optional[str], meta: Optional[dict]) -> Optional[str]:
        # Do not sign images (keep stable URL for caching)
        try:
            ct = (meta or {}).get("content_type")
            if isinstance(ct, str) and ct.lower().startswith("image/"):
                return val
        except Exception:
            pass
        try:
            if val:
                signed = r2utils.presign_get_for_public_url(val)
                return signed or val
        except Exception:
            pass
        return val

    result: List[dict] = []
    for m in db_messages:
        avatar_url = None
        sender = m.sender  # sender may be None if the user was deleted
        if sender:
            if sender.user_type == models.UserType.SERVICE_PROVIDER:
                profile = sender.artist_profile
                if profile and profile.profile_picture_url:
                    avatar_url = profile.profile_picture_url
            elif sender.profile_picture_url:
                avatar_url = sender.profile_picture_url
        avatar_url = _scrub_avatar(avatar_url)

        data = schemas.MessageResponse.model_validate(m).model_dump()
        data["avatar_url"] = avatar_url

        # Sign attachment URL on the fly when pointing at private R2.
        # For images, keep the original (public) URL to maximize cache hits.
        if data.get("attachment_url"):
            data["attachment_url"] = _maybe_sign_attachment_url(
                str(data.get("attachment_url") or ""),
                data.get("attachment_meta") if include_attachment_meta else None,
            )

        if include_attachment_meta:
            if data.get("attachment_meta"):
                data["attachment_meta"] = _scrub_attachment_meta(data.get("attachment_meta"))
        else:
            data.pop("attachment_meta", None)

        # Server-computed preview label for uniform clients
        try:
            data["preview_label"] = preview_label_for_message(m)
            key = None
            if m.message_type == models.MessageType.QUOTE:
                key = "quote"
            elif m.system_key:
                low = (m.system_key or "").strip().lower()
                if low.startswith("booking_details"):
                    key = "new_booking_request"
                elif low.startswith("payment_received") or low == "payment_received":
                    key = "payment_received"
                elif low.startswith("event_reminder"):
                    key = "event_reminder"
                else:
                    key = low
            data["preview_key"] = key
            if include_preview_args:
                data["preview_args"] = {}
            else:
                data.pop("preview_args", None)
        except Exception:
            data["preview_label"] = None
            if include_preview_args:
                data["preview_args"] = {}
            else:
                data.pop("preview_args", None)

        if include_reply_preview and m.reply_to_message_id:
            parent = (
                db.query(models.Message)
                .with_entities(models.Message.id, models.Message.content)
                .filter(models.Message.id == m.reply_to_message_id)
                .first()
            )
            if parent:
                data["reply_to_message_id"] = parent.id
                data["reply_to_preview"] = (parent.content or "")[:160]
        else:
            data.pop("reply_to_preview", None)

        if include_reactions:
            if m.id in aggregates:
                data["reactions"] = aggregates[m.id]
            else:
                data.pop("reactions", None)
            if m.id in my:
                data["my_reactions"] = my[m.id]
            else:
                data.pop("my_reactions", None)
        else:
            data.pop("reactions", None)
            data.pop("my_reactions", None)

        if include is not None:
            data = {k: v for k, v in data.items() if k in include}

        result.append(data)

    delta_cursor = None
    next_cursor = None
    if result:
        last_row = result[-1]
        last_id = last_row.get("id")
        if last_id is not None:
            delta_cursor = str(last_id)
        ts_val = last_row.get("timestamp")
        if isinstance(ts_val, datetime):
            next_cursor = ts_val.isoformat()
        elif isinstance(ts_val, str):
            next_cursor = ts_val

    total_latency_ms = (time.perf_counter() - request_start) * 1000.0

    envelope_dict = {
        "mode": normalized_mode,
        "items": result,
        "has_more": has_more,
        "next_cursor": next_cursor,
        "delta_cursor": delta_cursor,
        "requested_after_id": after_id,
        "requested_since": since,
        "total_latency_ms": round(total_latency_ms, 2),
        "db_latency_ms": round(db_latency_ms, 2),
        "payload_bytes": 0,
    }

    # Optionally attach quote summaries for any quote messages in this page
    # Ignore include_quotes when the client asks for very large pages to
    # avoid extra DB work on already heavy responses.
    include_quotes_effective = bool(include_quotes and requested_limit <= 120)
    if include_quotes_effective:
        try:
            quote_ids = sorted({int(m.get("quote_id")) for m in result if m.get("quote_id")})
        except Exception:
            quote_ids = []
        # Drop any quotes the client says it already has to avoid resending
        already_have: set[int] = set()
        try:
            if known_quote_ids:
                already_have = {
                    int(x)
                    for x in str(known_quote_ids).split(",")
                    if x.strip().isdigit()
                }
        except Exception:
            already_have = set()

        missing_ids: List[int] = [qid for qid in quote_ids if qid not in already_have]

        summaries: dict[int, dict] = {}
        if missing_ids:
            try:
                v2_rows = (
                    db.query(models.QuoteV2)
                    .filter(models.QuoteV2.id.in_(missing_ids))
                    .all()
                )
                for q in v2_rows:
                    try:
                        services = []
                        if isinstance(q.services, list):
                            for s in q.services:
                                d = (s or {}).get("description") if isinstance(s, dict) else None
                                p = (s or {}).get("price") if isinstance(s, dict) else None
                                if d is not None and p is not None:
                                    services.append({"description": d, "price": float(p)})
                        summaries[int(q.id)] = {
                            "id": int(q.id),
                            "booking_request_id": int(q.booking_request_id),
                            "status": str(q.status.value if hasattr(q.status, "value") else q.status),
                            "total": float(q.total),
                            "subtotal": float(q.subtotal) if getattr(q, "subtotal", None) is not None else float(q.total),
                            "sound_fee": float(q.sound_fee) if getattr(q, "sound_fee", None) is not None else 0.0,
                            "travel_fee": float(q.travel_fee) if getattr(q, "travel_fee", None) is not None else 0.0,
                            "discount": float(q.discount) if getattr(q, "discount", None) is not None else 0.0,
                            "expires_at": q.expires_at.isoformat() if getattr(q, "expires_at", None) else None,
                            "services": services,
                            "updated_at": q.updated_at.isoformat() if getattr(q, "updated_at", None) else None,
                        }
                    except Exception:
                        continue
            except Exception:
                pass
            # Fill any gaps from legacy quotes table best-effort
            try:
                missing = [qid for qid in missing_ids if qid not in summaries]
                if missing:
                    legacy_rows = (
                        db.query(models.Quote)
                        .filter(models.Quote.id.in_(missing))
                        .all()
                    )
                    for lq in legacy_rows:
                        try:
                            total = float(lq.price or 0)
                            services = [{"description": (lq.quote_details or "Performance"), "price": total}]
                            # Map legacy statuses to v2-ish statuses
                            raw = str(lq.status.value if hasattr(lq.status, "value") else lq.status).lower()
                            if "accept" in raw:
                                status_label = "accepted"
                            elif "reject" in raw or "declin" in raw:
                                status_label = "rejected"
                            elif "expire" in raw:
                                status_label = "expired"
                            else:
                                status_label = "pending"
                            summaries[int(lq.id)] = {
                                "id": int(lq.id),
                                "booking_request_id": int(lq.booking_request_id),
                                "status": status_label,
                                "total": total,
                                "subtotal": total,
                                "sound_fee": 0.0,
                                "travel_fee": 0.0,
                                "discount": 0.0,
                                "expires_at": lq.valid_until.isoformat() if getattr(lq, "valid_until", None) else None,
                                "services": services,
                                "updated_at": lq.updated_at.isoformat() if getattr(lq, "updated_at", None) else None,
                            }
                        except Exception:
                            continue
            except Exception:
                pass
        # Always include a quotes object when requested to avoid null wiping on clients
        envelope_dict["quotes"] = summaries if summaries else {}

    payload_probe = {
        **envelope_dict,
        "requested_since": since.isoformat() if isinstance(since, datetime) else None,
    }
    try:
        envelope_dict["payload_bytes"] = len(_json_dumps(payload_probe))
    except Exception:
        envelope_dict["payload_bytes"] = 0

    logger.info(
        "inbox_messages_response",
        extra={
            "event": "inbox_messages_response",
            "thread_id": request_id,
            "viewer": viewer.value if hasattr(viewer, "value") else str(viewer),
            "result_count": len(result),
            "db_latency_ms": envelope_dict["db_latency_ms"],
            "total_latency_ms": envelope_dict["total_latency_ms"],
            "payload_bytes": envelope_dict["payload_bytes"],
            "limit": limit,
            "after_id": after_id,
            "before_id": before_id,
            "mode": normalized_mode,
            "has_more": has_more,
            "requested_since": since.isoformat() if isinstance(since, datetime) else None,
            "user_id": current_user.id,
        },
    )

    # Fast ORJSON serialization + consistent ETag (skip heavy re-checks)
    try:
        body0 = _json_dumps(envelope_dict)
        try:
            envelope_dict["payload_bytes"] = len(body0)
        except Exception:
            envelope_dict["payload_bytes"] = 0
        body = _json_dumps(envelope_dict)
        viewer_label = "artist" if viewer == models.VisibleTo.ARTIST else "client"
        etag = etag_pre or _change_token(
            "msg",
            int(request_id), viewer_label, normalized_mode,
            int(after_id) if after_id is not None else "-",
            int(before_id) if before_id is not None else "-",
            int(effective_limit), int(snap_max_id) if 'snap_max_id' in locals() else 0, int(snap_count) if 'snap_count' in locals() else 0,
        )
    except Exception:
        body = _json_dumps(envelope_dict)
        etag = None

    headers = {
        "Cache-Control": "no-cache, private",
        "Vary": "If-None-Match, X-After-Write",
    }
    if etag:
        headers["ETag"] = etag
    return Response(content=body, media_type="application/json", headers=headers)

    # Conditional caching: weak ETag + short private cache
    try:
        quotes_obj = envelope_dict.get("quotes") if include_quotes else None
        quotes_count = 0
        if isinstance(quotes_obj, dict):
            try:
                quotes_count = len(quotes_obj)
            except Exception:
                quotes_count = 0
        last_id_marker = 0
        last_ts_marker = ""
        try:
            if result:
                last_row = result[-1]
                last_id = last_row.get("id")
                if isinstance(last_id, int):
                    last_id_marker = last_id
                ts_val = last_row.get("timestamp")
                last_ts_marker = ts_val.isoformat() if isinstance(ts_val, datetime) else str(ts_val or "")
        except Exception:
            pass
        import hashlib
        src = f"msg:{int(request_id)}:{normalized_mode}:{int(after_id) if after_id is not None else 'none'}:{int(before_id) if before_id is not None else 'none'}:{str(since) if since else ''}:{last_id_marker}:{last_ts_marker}:{len(result)}:{quotes_count}"
        etag = f'W/"{hashlib.sha1(src.encode()).hexdigest()}"'
        inm = None
        try:
            if request is not None:
                inm = request.headers.get("if-none-match") or request.headers.get("If-None-Match")
        except Exception:
            inm = None
        cache_control = "private, max-age=30, stale-while-revalidate=120"
        if inm and etag and inm.strip() == etag:
            # Short-circuit with 304 Not Modified
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag, "Cache-Control": cache_control})
        if response is not None and etag:
            try:
                response.headers["ETag"] = etag
                response.headers["Cache-Control"] = cache_control
            except Exception:
                pass
    except Exception:
        # Do not fail the request if ETag computation fails
        pass

    return schemas.MessageListResponse(**envelope_dict)


@router.get(
    "/booking-requests/messages-batch",
    response_model=schemas.MessagesBatchResponse,
    responses={304: {"description": "Not Modified"}},
)
def read_messages_batch(
    ids: str = Query(..., description="Comma-separated booking_request ids"),
    per: int = Query(20, ge=1, le=500, description="Messages per thread"),
    mode: Literal["full", "lite"] = Query("lite"),
    include_quotes: bool = Query(False),
    if_none_match: Optional[str] = Header(default=None, convert_underscores=False, alias="If-None-Match"),
    x_after_write: Optional[str] = Header(default=None, alias="X-After-Write", convert_underscores=False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return the latest ``per`` messages for multiple threads in one response.

    - Filters to threads where the current user is a participant
    - Applies visibility (VisibleTo) rules per thread
    - Returns items oldest→newest per thread for consistent hydration
    - Adds a weak ETag across all requested threads to allow 304s
    """

    # Parse and bound ids
    try:
        raw = [s.strip() for s in str(ids or "").split(",") if s.strip()]
        thread_ids: list[int] = [int(x) for x in raw if x.isdigit()]
    except Exception:
        thread_ids = []
    if not thread_ids:
        return schemas.MessagesBatchResponse(mode=mode, threads={}, payload_bytes=0)
    # Reasonable upper bound to avoid excessive fanout
    if len(thread_ids) > 200:
        thread_ids = thread_ids[:200]

    # Pre-authorize threads; derive viewer role per thread for visibility filtering
    br_rows = (
        db.query(models.BookingRequest)
        .filter(models.BookingRequest.id.in_(thread_ids))
        .all()
    )
    allowed_ids: list[int] = []
    viewer_by_id: dict[int, models.VisibleTo] = {}
    for br in br_rows:
        try:
            if current_user.id in [br.client_id, br.artist_id]:
                allowed_ids.append(int(br.id))
                viewer_by_id[int(br.id)] = (
                    models.VisibleTo.CLIENT
                    if current_user.id == br.client_id
                    else models.VisibleTo.ARTIST
                )
        except Exception:
            continue
    if not allowed_ids:
        return schemas.MessagesBatchResponse(mode=mode, threads={}, payload_bytes=0)

    # ETag pre-check (cheap snapshot across requested threads)
    try:
        skip_pre = _coalesce_bool(x_after_write)
        viewer = models.VisibleTo.ARTIST if current_user.user_type == models.UserType.SERVICE_PROVIDER else models.VisibleTo.CLIENT
        rows = (
            db.query(models.Message.booking_request_id, func.max(models.Message.id).label("max_id"), func.count(models.Message.id).label("cnt"))
            .filter(models.Message.booking_request_id.in_(allowed_ids))
            .filter(models.Message.visible_to.in_([models.VisibleTo.BOTH, viewer]))
            .group_by(models.Message.booking_request_id)
            .all()
        )
        parts: list[str] = []
        by_id = {int(getattr(r, "booking_request_id")): (int(getattr(r, "max_id", 0) or 0), int(getattr(r, "cnt", 0) or 0)) for r in rows}
        for rid in sorted(allowed_ids):
            mx, ct = by_id.get(int(rid), (0, 0))
            parts.append(f"{rid}:{mx}:{ct}")
        import hashlib
        basis = f"mb:{int(current_user.id)}:{int(per)}:{'|'.join(parts)}"
        etag_pre = f'W/"{hashlib.sha1(basis.encode()).hexdigest()}"'
        if (not skip_pre) and if_none_match and if_none_match.strip() == etag_pre:
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={
                "ETag": etag_pre,
                "Cache-Control": "no-cache, private",
                "Vary": "If-None-Match, X-After-Write",
            })
    except Exception:
        etag_pre = None  # type: ignore

    # Fetch recent messages per request (newest first in groups)
    grouped = crud.crud_message.get_recent_messages_for_requests(
        db,
        allowed_ids,
        per_request=per,
    )

    # Serialize and filter by visibility; return oldest→newest for each list
    threads_out: dict[int, list[dict]] = {}
    quote_ids: set[int] = set()

    def _scrub_avatar(val: Optional[str]) -> Optional[str]:
        try:
            if isinstance(val, str) and val.startswith("data:") and len(val) > 1000:
                return "/static/default-avatar.svg"
        except Exception:
            pass
        return val

    def _scrub_attachment_meta(val: Optional[dict]) -> Optional[dict]:
        if not isinstance(val, dict):
            return val
        try:
            cleaned = {
                key: value
                for key, value in val.items()
                if key not in {
                    "data_url",
                    "dataUrl",
                    "preview",
                    "preview_base64",
                    "previewBase64",
                    "preview_data_url",
                }
            }
            thumb = cleaned.get("thumbnail")
            if isinstance(thumb, str) and thumb.startswith("data:") and len(thumb) > 200:
                cleaned.pop("thumbnail", None)
            return cleaned or None
        except Exception:
            return None

    for req_id, items in grouped.items():
        viewer = viewer_by_id.get(int(req_id))
        serial: list[dict] = []
        for m in (items or [])[::-1]:  # items are newest→oldest; reverse to oldest→newest
            try:
                if viewer and m.visible_to not in [models.VisibleTo.BOTH, viewer]:
                    continue
                row = schemas.MessageResponse.model_validate(m).model_dump()
                # Optional avatar derivation (best-effort)
                avatar_url = None
                try:
                    sender = getattr(m, "sender", None)
                    if sender:
                        if sender.user_type == models.UserType.SERVICE_PROVIDER:
                            profile = getattr(sender, "artist_profile", None)
                            if profile and getattr(profile, "profile_picture_url", None):
                                avatar_url = profile.profile_picture_url
                        elif getattr(sender, "profile_picture_url", None):
                            avatar_url = sender.profile_picture_url
                except Exception:
                    avatar_url = None
                if avatar_url:
                    row["avatar_url"] = _scrub_avatar(avatar_url)
                # Trim heavy attachment previews
                if row.get("attachment_meta"):
                    row["attachment_meta"] = _scrub_attachment_meta(row.get("attachment_meta"))
                if row.get("quote_id"):
                    try:
                        qid = int(row.get("quote_id"))
                        if qid > 0:
                            quote_ids.add(qid)
                    except Exception:
                        pass
                serial.append(row)
            except Exception:
                continue
        threads_out[int(req_id)] = serial

    # Compute a weak ETag across threads for short-circuiting
    try:
        import hashlib
        parts: list[str] = []
        for tid in sorted(threads_out.keys()):
            lst = threads_out[tid]
            if not lst:
                parts.append(f"{tid}:0:0:0")
                continue
            last = lst[-1]
            lid = int(last.get("id")) if isinstance(last.get("id"), int) else 0
            lts = last.get("timestamp")
            lts_s = lts.isoformat() if isinstance(lts, datetime) else str(lts or "")
            parts.append(f"{tid}:{lid}:{lts_s}:{len(lst)}")
        src = f"mb:{current_user.id}:{per}:{'|'.join(parts)}"
        etag = f'W/"{hashlib.sha1(src.encode()).hexdigest()}"'
    except Exception:
        etag = None

    if etag and if_none_match and if_none_match.strip() == etag:
        from fastapi import Response as FastAPIResponse
        return FastAPIResponse(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

    # Optionally include quotes summaries across all threads
    quotes_map: dict[int, dict] = {}
    if include_quotes and quote_ids:
        try:
            v2_rows = (
                db.query(models.QuoteV2)
                .filter(models.QuoteV2.id.in_(list(quote_ids)))
                .all()
            )
            for q in v2_rows:
                try:
                    services = []
                    if isinstance(q.services, list):
                        for s in q.services:
                            d = (s or {}).get("description") if isinstance(s, dict) else None
                            p = (s or {}).get("price") if isinstance(s, dict) else None
                            if d is not None and p is not None:
                                services.append({"description": d, "price": float(p)})
                    quotes_map[int(q.id)] = {
                        "id": int(q.id),
                        "booking_request_id": int(q.booking_request_id),
                        "status": str(q.status.value if hasattr(q.status, "value") else q.status),
                        "total": float(q.total),
                        "subtotal": float(q.subtotal) if getattr(q, "subtotal", None) is not None else float(q.total),
                        "sound_fee": float(q.sound_fee) if getattr(q, "sound_fee", None) is not None else 0.0,
                        "travel_fee": float(q.travel_fee) if getattr(q, "travel_fee", None) is not None else 0.0,
                        "discount": float(q.discount) if getattr(q, "discount", None) is not None else 0.0,
                        "expires_at": q.expires_at.isoformat() if getattr(q, "expires_at", None) else None,
                        "services": services,
                        "updated_at": q.updated_at.isoformat() if getattr(q, "updated_at", None) else None,
                    }
                except Exception:
                    continue
        except Exception:
            pass
        # Fill gaps from legacy quotes, best-effort
        try:
            missing = [qid for qid in list(quote_ids) if qid not in quotes_map]
            if missing:
                legacy_rows = (
                    db.query(models.Quote)
                    .filter(models.Quote.id.in_(missing))
                    .all()
                )
                for lq in legacy_rows:
                    try:
                        total = float(lq.price or 0)
                        services = [{"description": (lq.quote_details or "Performance"), "price": total}]
                        raw = str(lq.status.value if hasattr(lq.status, "value") else lq.status).lower()
                        if "accept" in raw:
                            status_label = "accepted"
                        elif "reject" in raw or "declin" in raw:
                            status_label = "rejected"
                        elif "expire" in raw:
                            status_label = "expired"
                        else:
                            status_label = "pending"
                        quotes_map[int(lq.id)] = {
                            "id": int(lq.id),
                            "booking_request_id": int(lq.booking_request_id),
                            "status": status_label,
                            "total": total,
                            "subtotal": total,
                            "sound_fee": 0.0,
                            "travel_fee": 0.0,
                            "discount": 0.0,
                            "expires_at": lq.valid_until.isoformat() if getattr(lq, "valid_until", None) else None,
                            "services": services,
                            "updated_at": lq.updated_at.isoformat() if getattr(lq, "updated_at", None) else None,
                        }
                    except Exception:
                        continue
        except Exception:
            pass

    envelope = {
        "mode": mode,
        "threads": threads_out,
        "payload_bytes": 0,
    }
    if include_quotes:
        envelope["quotes"] = quotes_map

    # payload byte size probe
    try:
        envelope["payload_bytes"] = len(_json_dumps(envelope))
    except Exception:
        envelope["payload_bytes"] = 0

    # Cache headers (aligned with threads endpoints)
    headers = {"Cache-Control": "no-cache, private", "Vary": "If-None-Match, X-After-Write"}
    if (locals().get('etag_pre') is not None) and not (locals().get('etag') and etag):
        headers["ETag"] = locals().get('etag_pre')
    elif etag:
        headers["ETag"] = etag
    try:
        from fastapi.responses import JSONResponse
        return JSONResponse(content=envelope, headers=headers)
    except Exception:
        return envelope


@router.put("/booking-requests/{request_id}/messages/read")
async def mark_messages_read(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Mark messages in the thread as read by the current user."""
    booking_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not booking_request:
        raise error_response(
            "Booking request not found",
            {"request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response(
            "Not authorized to modify messages",
            {},
            status.HTTP_403_FORBIDDEN,
        )
    last_unread = crud.crud_message.get_last_unread_message_id(
        db, request_id, current_user.id
    )
    updated = crud.crud_message.mark_messages_read(db, request_id, current_user.id)
    # Also clear thread-scoped NEW_MESSAGE notifications for this user so
    # aggregate counts stay in sync even if the client does not call the
    # notifications API explicitly.
    try:
        from ..crud import crud_notification as _crud_notif  # local import to avoid cycles
        _crud_notif.mark_thread_read(db, current_user.id, request_id)
    except Exception:
        pass
    if updated > 0 and last_unread:
        background_tasks.add_task(
            manager.broadcast,
            request_id,
            {"v": 1, "type": "read", "up_to_id": int(last_unread), "user_id": int(current_user.id)},
        )

    # Push updated aggregate unread total to the user's notifications channel so header can refresh outside Inbox
    try:
        total, _ = crud.crud_message.get_unread_message_totals_for_user(db, int(current_user.id))
        background_tasks.add_task(
            notifications_manager.broadcast,
            int(current_user.id),
            {"v": 1, "type": "unread_total", "payload": {"total": int(total)}},
        )
    except Exception:
        logger.exception("Failed to push unread_total notification", extra={"user_id": current_user.id})
    return {"updated": updated}


class DeliveredIn(BaseModel):
    up_to_id: int


@router.put("/booking-requests/{request_id}/messages/delivered")
async def mark_messages_delivered(
    request_id: int,
    payload: DeliveredIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Signal that the current user has received messages up to the given id.

    This is an ephemeral hint to flip sender bubbles to 'delivered'. It does not
    persist any DB state; it only broadcasts an event on the thread topic.
    """
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise error_response(
            "Booking request not found",
            {"request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response(
            "Not authorized to modify messages",
            {},
            status.HTTP_403_FORBIDDEN,
        )
    up_to_id = int(getattr(payload, 'up_to_id', 0) or 0)
    if up_to_id <= 0:
        return {"ok": True}
    try:
        await manager.broadcast(
            request_id,
            {"v": 1, "type": "delivered", "up_to_id": up_to_id, "user_id": int(current_user.id)},
        )
    except Exception:
        logger.exception("Failed to broadcast delivered signal", extra={"request_id": request_id, "user_id": current_user.id})
    try:
        metrics_incr("message.delivered_signal_total")
    except Exception:
        pass
    return {"ok": True}


@router.post(
    "/booking-requests/{request_id}/messages", response_model=schemas.MessageResponse
)
def create_message(
    request_id: int,
    message_in: schemas.MessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    request: Request = None,
):
    booking_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not booking_request:
        raise error_response(
            "Booking request not found",
            {"request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response(
            "Not authorized to send message",
            {},
            status.HTTP_403_FORBIDDEN,
        )
    # Validate: disallow empty text unless an attachment is present
    # Allows sending attachment-only messages (e.g., images, PDFs) without text.
    if (
        (not message_in.content or not message_in.content.strip())
        and not (message_in.attachment_url and str(message_in.attachment_url).strip())
    ):
        raise error_response(
            "Message content cannot be empty",
            {"content": "required"},
            status.HTTP_400_BAD_REQUEST,
        )

    sender_type = (
        models.SenderType.CLIENT
        if current_user.id == booking_request.client_id
        else models.SenderType.ARTIST
    )

    sender_id = current_user.id
    # System messages are automated questions. They should appear from the
    # artist, not the client who triggered the flow.
    if message_in.message_type == models.MessageType.SYSTEM:
        sender_type = models.SenderType.ARTIST
        sender_id = booking_request.artist_id

    # Auto-assign a stable system_key for booking details summaries
    sys_key = None
    if (
        message_in.message_type == models.MessageType.SYSTEM
        and isinstance(message_in.content, str)
        and message_in.content.startswith(BOOKING_DETAILS_PREFIX)
    ):
        sys_key = "booking_details_v1"

    # Special handling: client requests a new quote → per-day idempotency + provider notification
    is_quote_request = False
    try:
        if message_in.message_type == models.MessageType.SYSTEM:
            raw = (message_in.content or "").strip().lower()
            key = str(message_in.system_key or "").lower()
            is_quote_request = (raw == "new quote requested") or ("quote_requested" in key)
    except Exception:
        is_quote_request = False

    # Enforce one request per day per thread: if a message exists with today's key, return it directly
    todays_key = None
    if is_quote_request:
        try:
            from datetime import datetime as _dt
            todays_key = f"quote_requested_{_dt.now().strftime('%Y%m%d')}"
            existing = (
                db.query(models.Message)
                .filter(
                    models.Message.booking_request_id == request_id,
                    models.Message.system_key == todays_key,
                )
                .order_by(models.Message.id.desc())
                .first()
            )
            if existing:
                data = schemas.MessageResponse.model_validate(existing).model_dump()
                # Ensure avatar_url included (parity w/normal path)
                sender = existing.sender
                avatar_url = None
                if sender:
                    if sender.user_type == models.UserType.SERVICE_PROVIDER:
                        profile = sender.artist_profile
                        if profile and profile.profile_picture_url:
                            avatar_url = profile.profile_picture_url
                    elif sender.profile_picture_url:
                        avatar_url = sender.profile_picture_url
                data["avatar_url"] = avatar_url
                return data
        except Exception:
            pass
        # Set a server-side system key for persistence to guarantee idempotency
        sys_key = todays_key or sys_key

    # Validate reply target if provided
    if message_in.reply_to_message_id:
        parent = (
            db.query(models.Message)
            .filter(models.Message.id == message_in.reply_to_message_id)
            .first()
        )
        if not parent or parent.booking_request_id != request_id:
            raise error_response(
                "Reply target not found",
                {"reply_to_message_id": "not_found"},
                status.HTTP_404_NOT_FOUND,
            )

    # Best-effort idempotency: suppress accidental rapid duplicates (payload match)
    try:
        last = (
            db.query(models.Message)
            .filter(
                models.Message.booking_request_id == request_id,
                models.Message.sender_id == sender_id,
            )
            .order_by(models.Message.id.desc())
            .first()
        )
        if last:
            same_type = last.message_type == message_in.message_type
            same_visibility = last.visible_to == message_in.visible_to
            same_content = (last.content or "").strip() == (message_in.content or "").strip()
            same_attachment = (last.attachment_url or None) == (
                message_in.attachment_url or None
            )
            same_meta = (last.attachment_meta or None) == (
                message_in.attachment_meta or None
            )
            same_reply = (last.reply_to_message_id or None) == (
                message_in.reply_to_message_id or None
            )
            if (
                same_type
                and same_visibility
                and same_content
                and same_attachment
                and same_meta
                and same_reply
            ):
                try:
                    dt_last_utc = last.timestamp.astimezone(timezone.utc)
                    dt_now_utc = datetime.now(timezone.utc)
                    delta = (dt_now_utc - dt_last_utc).total_seconds()
                    # Treat repeats within 15s as duplicates (e.g., double-tap / reconnect resend)
                    if delta >= 0 and delta <= 15:
                        data = schemas.MessageResponse.model_validate(last).model_dump()
                        # Ensure avatar_url present for parity with normal path
                        sender = last.sender
                        avatar_url = None
                        if sender:
                            if sender.user_type == models.UserType.SERVICE_PROVIDER:
                                profile = sender.artist_profile
                                if profile and profile.profile_picture_url:
                                    avatar_url = profile.profile_picture_url
                            elif sender.profile_picture_url:
                                avatar_url = sender.profile_picture_url
                        data["avatar_url"] = avatar_url
                        return data
                except Exception:
                    # Never hard-fail idempotency checks; fall through to create
                    pass
    except Exception:
        # Defensive: do not block message creation if the pre-check fails
        pass

    # Optional Idempotency-Key header: return previously created message by key
    try:
        id_key = _idemp_cache_key(request_id, current_user.id, request.headers.get("Idempotency-Key") if request else None)
    except Exception:
        id_key = None
    # Optional client correlation id: echoed to the WS envelope/response only; not persisted
    try:
        client_req_id = None
        if request is not None:
            raw_cid = request.headers.get("X-Client-Request-Id") or request.headers.get("x-client-request-id")
            if raw_cid:
                raw_cid = str(raw_cid).strip()
                if raw_cid:
                    # Keep it modest; envelopes are transient
                    client_req_id = raw_cid[:128]
    except Exception:
        client_req_id = None
    if id_key:
        msg_id = _idemp_cache_get(id_key)
        if msg_id:
            existing = db.query(models.Message).filter(models.Message.id == msg_id).first()
            if existing:
                data = schemas.MessageResponse.model_validate(existing).model_dump()
                sender = existing.sender
                avatar_url = None
                if sender:
                    if sender.user_type == models.UserType.SERVICE_PROVIDER:
                        profile = sender.artist_profile
                        if profile and profile.profile_picture_url:
                            avatar_url = profile.profile_picture_url
                    elif sender.profile_picture_url:
                        avatar_url = sender.profile_picture_url
                data["avatar_url"] = avatar_url
                # Echo the client correlation id (response only; response_model will strip unknown keys safely)
                if client_req_id:
                    try:
                        data["client_request_id"] = client_req_id
                    except Exception:
                        pass
                return data

    msg = crud.crud_message.create_message(
        db,
        booking_request_id=request_id,
        sender_id=sender_id,
        sender_type=sender_type,
        content=message_in.content,
        message_type=message_in.message_type,
        visible_to=message_in.visible_to,
        quote_id=message_in.quote_id,
        attachment_url=message_in.attachment_url,
        attachment_meta=message_in.attachment_meta,
        action=message_in.action,
        system_key=(sys_key or message_in.system_key),
        expires_at=message_in.expires_at,
    )
    # Set reply reference if provided
    if message_in.reply_to_message_id:
        msg.reply_to_message_id = message_in.reply_to_message_id
        db.add(msg)
        db.commit()
        db.refresh(msg)
    other_user_id = (
        booking_request.artist_id
        if sender_type == models.SenderType.CLIENT
        else booking_request.client_id
    )
    other_user = db.query(models.User).filter(models.User.id == other_user_id).first()

    service = None
    if booking_request.service_id:
        service = (
            db.query(models.Service)
            .filter(models.Service.id == booking_request.service_id)
            .first()
        )

    if service and service.service_type == "Personalized Video":
        if (
            message_in.message_type == models.MessageType.SYSTEM
            and message_in.content == VIDEO_FLOW_READY_MESSAGE
            and other_user
        ):
            client = (
                db.query(models.User)
                .filter(models.User.id == booking_request.client_id)
                .first()
            )
            booking_type = service.service_type
            sender_name = (
                f"{client.first_name} {client.last_name}" if client else "Client"
            )
            artist = (
                db.query(models.User)
                .filter(models.User.id == booking_request.artist_id)
                .first()
            )
            if artist:
                notify_user_new_booking_request(
                    db, artist, request_id, sender_name, booking_type
                )
        # suppress message notifications during flow
    elif other_user:
        # For "New quote requested", notify the provider explicitly and skip the generic new-message notify to the client
        if is_quote_request:
            try:
                provider = db.query(models.User).filter(models.User.id == booking_request.artist_id).first()
                if provider:
                    notify_quote_requested(db, provider, request_id)
            except Exception:
                pass
        else:
            notify_user_new_message(
                db,
                other_user,
                current_user,
                request_id,
                message_in.content,
                message_in.message_type,
                message_id=int(getattr(msg, "id", 0)) or None,
            )

    avatar_url = None
    sender = msg.sender  # sender should exist, but guard against missing relation
    if sender:
        if sender.user_type == models.UserType.SERVICE_PROVIDER:
            profile = sender.artist_profile
            if profile and profile.profile_picture_url:
                avatar_url = profile.profile_picture_url
        elif sender.profile_picture_url:
            avatar_url = sender.profile_picture_url

    data = schemas.MessageResponse.model_validate(msg).model_dump()
    data["avatar_url"] = avatar_url
    if data.get("attachment_url"):
        try:
            data["attachment_url"] = r2utils.presign_get_for_public_url(str(data.get("attachment_url") or "")) or data["attachment_url"]
        except Exception:
            pass
    # Add reply preview if any
    if msg.reply_to_message_id:
        parent = (
            db.query(models.Message)
            .filter(models.Message.id == msg.reply_to_message_id)
            .first()
        )
        if parent:
            data["reply_to_message_id"] = parent.id
            data["reply_to_preview"] = parent.content[:160]
    # Include transient client correlation id in the envelope (not persisted)
    if client_req_id:
        try:
            data["client_request_id"] = client_req_id
        except Exception:
            pass
    # Broadcast new message to thread via BackgroundTasks (post-commit, non-blocking)
    try:
        background_tasks.add_task(manager.broadcast, request_id, data)
    except Exception:
        pass
    # Also broadcast a lightweight thread_tail hint so clients can reconcile gaps deterministically
    try:
        snippet = preview_label_for_message(msg)
        last_ts = None
        try:
            # msg.timestamp can be datetime; normalize to iso string
            last_ts = (msg.timestamp.isoformat() if hasattr(msg, 'timestamp') and msg.timestamp else None)
        except Exception:
            last_ts = None
        tail_payload = {
            "thread_id": int(request_id),
            "last_id": int(getattr(msg, "id", 0) or 0),
            "last_ts": last_ts,
            "snippet": snippet or "",
        }
        try:
            env = Envelope(type="thread_tail", payload=tail_payload)
        except Exception:
            env = Envelope()
            env.type = "thread_tail"
            env.payload = tail_payload  # type: ignore
        try:
            background_tasks.add_task(manager.broadcast, request_id, env)
        except Exception:
            pass
    except Exception:
        pass
    # Optional reliable fanout for attachments/system messages
    try:
        if data.get("attachment_url") or str(data.get("message_type") or "").upper() == "SYSTEM":
            from ..utils.outbox import enqueue_outbox
            enqueue_outbox(db, topic=f"booking-requests:{int(request_id)}", payload=data)
    except Exception:
        pass
    # Metrics (best-effort)
    try:
        metrics_incr("message.create_success_total")
    except Exception:
        pass
    # Opportunistic read receipt: when a user sends a message, consider all
    # prior incoming messages as read and broadcast a 'read' event so the
    # counterparty's UI updates immediately even if the reader's tab is not
    # strictly anchored at the bottom.
    try:
        last_unread = crud.crud_message.get_last_unread_message_id(db, request_id, current_user.id)
        updated = crud.crud_message.mark_messages_read(db, request_id, current_user.id)
    except Exception:
        last_unread = None
        updated = 0
    if updated and last_unread:
        background_tasks.add_task(
            manager.broadcast,
            request_id,
            {"v": 1, "type": "read", "up_to_id": int(last_unread), "user_id": int(current_user.id)},
        )
    # Push unread_total to the recipient so their header updates outside Inbox
    try:
        other_user_id = (
            booking_request.artist_id if current_user.id == booking_request.client_id else booking_request.client_id
        )
        total_for_other, _ = crud.crud_message.get_unread_message_totals_for_user(db, int(other_user_id))
        background_tasks.add_task(
            notifications_manager.broadcast,
            int(other_user_id),
            {"v": 1, "type": "unread_total", "payload": {"total": int(total_for_other)}},
        )
    except Exception:
        pass
    # Also push unread_total to the sender in case opportunistic read changed their total
    try:
        total_for_self, _ = crud.crud_message.get_unread_message_totals_for_user(db, int(current_user.id))
        background_tasks.add_task(
            notifications_manager.broadcast,
            int(current_user.id),
            {"v": 1, "type": "unread_total", "payload": {"total": int(total_for_self)}},
        )
    except Exception:
        pass
    # Record idempotency mapping for the newly created message
    try:
        if id_key:
            _idemp_cache_put(id_key, int(msg.id))
    except Exception:
        pass
    return data


@router.delete(
    "/booking-requests/{request_id}/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_message(
    request_id: int = Path(..., description="Booking request id"),
    message_id: int = Path(..., description="Message id"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Delete a single message in a thread.

    Rules:
    - The message must belong to the given booking request
    - Only the sender of the message (or the counterparty if message_type is SYSTEM with a system_key) can delete
    - Both client and artist can delete their own messages
    """
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise error_response(
            "Booking request not found",
            {"request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response(
            "Not authorized to modify messages",
            {},
            status.HTTP_403_FORBIDDEN,
        )

    msg = (
        db.query(models.Message)
        .filter(models.Message.id == message_id)
        .first()
    )
    if not msg or msg.booking_request_id != request_id:
        raise error_response(
            "Message not found",
            {"message_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    # Only the original sender may delete non-system messages
    if msg.message_type != models.MessageType.SYSTEM:
        if msg.sender_id != current_user.id:
            raise error_response(
                "You can only delete your own messages",
                {},
                status.HTTP_403_FORBIDDEN,
            )
    else:
        # Allow deleting a system message only by the artist (owner of automation)
        if current_user.id != booking_request.artist_id:
            raise error_response(
                "You cannot delete this message",
                {},
                status.HTTP_403_FORBIDDEN,
            )

    ok = crud.crud_message.delete_message(db, message_id)
    if not ok:
        raise error_response(
            "Delete failed",
            {"message_id": "delete_failed"},
            status.HTTP_400_BAD_REQUEST,
        )
    # Broadcast a minimal deletion event to the thread so other participants
    # can update their UI immediately.
    try:
        background_tasks.add_task(
            manager.broadcast,
            request_id,
            {"v": 1, "type": "message_deleted", "id": message_id},
        )
    except Exception:
        # Best-effort only; deletion is already persisted.
        pass
    # No content response
    return


@router.post(
    "/booking-requests/{request_id}/attachments", status_code=status.HTTP_201_CREATED
)
async def upload_attachment(
    request_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    booking_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not booking_request:
        raise error_response(
            "Booking request not found",
            {"request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response(
            "Not authorized to upload attachment",
            {},
            status.HTTP_403_FORBIDDEN,
        )

    original_name = file.filename or "attachment"
    _, ext = os.path.splitext(original_name)
    unique_filename = f"{uuid.uuid4()}{ext}"
    save_path = os.path.join(ATTACHMENTS_DIR, unique_filename)
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()

    url = f"/static/attachments/{unique_filename}"
    try:
        size = os.path.getsize(save_path)
    except OSError:
        size = None
    content_type = file.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"
    metadata = {
        "original_filename": original_name,
        "content_type": content_type,
        "size": size,
    }
    return {"url": url, "metadata": metadata}

class ReactionIn(BaseModel):
    emoji: str


@router.post(
    "/booking-requests/{request_id}/messages/{message_id}/reactions",
    status_code=status.HTTP_204_NO_CONTENT,
)
def add_reaction(
    request_id: int,
    message_id: int,
    payload: ReactionIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise error_response("Booking request not found", {"request_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response("Not authorized", {}, status.HTTP_403_FORBIDDEN)
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg or msg.booking_request_id != request_id:
        raise error_response("Message not found", {"message_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    crud.crud_message_reaction.add_reaction(db, message_id, current_user.id, payload.emoji)
    # Broadcast minimal reaction update
    try:
        data = {"v": 1, "type": "reaction_added", "payload": {"message_id": message_id, "emoji": payload.emoji, "user_id": current_user.id}}
        background_tasks.add_task(manager.broadcast, request_id, data)
    except Exception:
        pass
    return


@router.delete(
    "/booking-requests/{request_id}/messages/{message_id}/reactions",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_reaction(
    request_id: int,
    message_id: int,
    payload: ReactionIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise error_response("Booking request not found", {"request_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response("Not authorized", {}, status.HTTP_403_FORBIDDEN)
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg or msg.booking_request_id != request_id:
        raise error_response("Message not found", {"message_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    crud.crud_message_reaction.remove_reaction(db, message_id, current_user.id, payload.emoji)
    try:
        data = {"v": 1, "type": "reaction_removed", "payload": {"message_id": message_id, "emoji": payload.emoji, "user_id": current_user.id}}
        background_tasks.add_task(manager.broadcast, request_id, data)
    except Exception:
        pass
    return


@router.post(
    "/booking-requests/{request_id}/attachments/presign",
    response_model=PresignOut,
)
def presign_attachment(
    request_id: int,
    payload: PresignIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise error_response("Booking request not found", {"request_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response("Not authorized to upload attachment", {}, status.HTTP_403_FORBIDDEN)

    try:
        info = r2utils.presign_put(
            kind=(payload.kind or "file"),
            booking_id=request_id,
            filename=payload.filename,
            content_type=payload.content_type,
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Failed to presign R2 upload: %s", exc)
        raise error_response("Failed to prepare upload", {}, status.HTTP_500_INTERNAL_SERVER_ERROR)

    return PresignOut(
        key=info["key"],
        put_url=info["put_url"],
        get_url=info.get("get_url"),
        public_url=info.get("public_url"),
        headers=info.get("headers") or {},
        upload_expires_in=int(info.get("upload_expires_in") or 0),
        download_expires_in=int(info.get("download_expires_in") or 0),
    )


class AttachmentInitIn(BaseModel):
    kind: str | None = None
    filename: str | None = None
    content_type: str | None = None
    size: int | None = None


@router.post(
    "/booking-requests/{request_id}/messages/attachments/init",
    status_code=status.HTTP_200_OK,
)
def init_attachment_message(
    request_id: int,
    payload: AttachmentInitIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise error_response("Booking request not found", {"request_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response("Not authorized to start attachment", {}, status.HTTP_403_FORBIDDEN)

    sender_type = (
        models.SenderType.CLIENT if current_user.id == booking_request.client_id else models.SenderType.ARTIST
    )
    # Create placeholder message (no URL/meta yet)
    msg = crud.crud_message.create_message(
        db,
        booking_request_id=request_id,
        sender_id=current_user.id,
        sender_type=sender_type,
        content=payload.filename or "[attachment]",
        message_type=models.MessageType.USER,
        visible_to=models.VisibleTo.BOTH,
        quote_id=None,
        attachment_url=None,
        attachment_meta=None,
        action=None,
        system_key=None,
        expires_at=None,
    )
    db.refresh(msg)

    # Serialize envelope (align with create_message)
    data = schemas.MessageResponse.model_validate(msg).model_dump()
    avatar_url = None
    sender = msg.sender
    if sender:
        if sender.user_type == models.UserType.SERVICE_PROVIDER:
            profile = sender.artist_profile
            if profile and profile.profile_picture_url:
                avatar_url = profile.profile_picture_url
        elif sender.profile_picture_url:
            avatar_url = sender.profile_picture_url
    data["avatar_url"] = avatar_url

    # Presign direct upload
    try:
        info = r2utils.presign_put(
            kind=(payload.kind or "file"),
            booking_id=request_id,
            filename=payload.filename,
            content_type=payload.content_type,
        )
    except Exception as exc:
        logger.exception("Failed to presign init attachment: %s", exc)
        # If presign fails, we still return the message so client may fallback
        info = {"key": "", "put_url": None, "headers": {}, "public_url": None, "get_url": None, "upload_expires_in": 0, "download_expires_in": 0}

    # Best-effort broadcast placeholder and enqueue outbox
    try:
        background_tasks.add_task(manager.broadcast, request_id, data)
        try:
            enqueue_outbox(db, topic=f"booking-requests:{int(request_id)}", payload=data)
        except Exception:
            pass
    except Exception:
        pass
    try:
        metrics_incr("message.attachment_init_total")
    except Exception:
        pass
    return {"message": data, "presign": info}


class AttachmentFinalizeIn(BaseModel):
    url: str
    metadata: dict | None = None


@router.post(
    "/booking-requests/{request_id}/messages/{message_id}/attachments/finalize",
    status_code=status.HTTP_200_OK,
)
def finalize_attachment_message(
    request_id: int,
    message_id: int,
    payload: AttachmentFinalizeIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise error_response("Booking request not found", {"request_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise error_response("Not authorized to finalize attachment", {}, status.HTTP_403_FORBIDDEN)

    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg or msg.booking_request_id != request_id:
        raise error_response("Message not found", {"message_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    # Only the original sender may finalize
    if msg.sender_id != current_user.id:
        raise error_response("You can only finalize your own message", {}, status.HTTP_403_FORBIDDEN)

    # Persist URL and metadata
    try:
        msg.attachment_url = payload.url
        if isinstance(payload.metadata, dict):
            msg.attachment_meta = payload.metadata
        db.add(msg)
        db.commit()
        db.refresh(msg)
    except Exception as exc:
        logger.exception("Finalize attachment failed: %s", exc)
        raise error_response("Finalize failed", {"attachment": "persist_failed"}, status.HTTP_400_BAD_REQUEST)

    # Serialize envelope with potential public read URL transformation
    data = schemas.MessageResponse.model_validate(msg).model_dump()
    avatar_url = None
    sender = msg.sender
    if sender:
        if sender.user_type == models.UserType.SERVICE_PROVIDER:
            profile = sender.artist_profile
            if profile and profile.profile_picture_url:
                avatar_url = profile.profile_picture_url
        elif sender.profile_picture_url:
            avatar_url = sender.profile_picture_url
    data["avatar_url"] = avatar_url
    if data.get("attachment_url"):
        try:
            data["attachment_url"] = r2utils.presign_get_for_public_url(str(data.get("attachment_url") or "")) or data["attachment_url"]
        except Exception:
            pass

    # Broadcast update and enqueue outbox
    try:
        background_tasks.add_task(manager.broadcast, request_id, data)
        try:
            enqueue_outbox(db, topic=f"booking-requests:{int(request_id)}", payload=data)
        except Exception:
            pass
    except Exception:
        pass
    try:
        metrics_incr("message.attachment_finalize_total")
    except Exception:
        pass
    return data
