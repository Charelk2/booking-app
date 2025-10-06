from fastapi import (
    APIRouter,
    Depends,
    status,
    UploadFile,
    File,
    BackgroundTasks,
    Query,
    Path,
)
from sqlalchemy.orm import Session
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
)
from ..utils.messages import BOOKING_DETAILS_PREFIX, preview_label_for_message
from ..utils import error_response
from ..utils import r2 as r2utils
from .api_ws import manager
import os
import mimetypes
import uuid
import shutil
from pydantic import BaseModel
import orjson

router = APIRouter(tags=["messages"])

logger = logging.getLogger(__name__)

DEFAULT_ATTACHMENTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "static", "attachments")
)
ATTACHMENTS_DIR = os.getenv("ATTACHMENTS_DIR", DEFAULT_ATTACHMENTS_DIR)
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)


@router.get(
    "/booking-requests/{request_id}/messages",
    response_model=schemas.MessageListResponse,
)
def read_messages(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    after_id: Optional[int] = Query(
        None,
        description="Return only messages with an id greater than this value",
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

    effective_limit = int(limit)
    query_limit = effective_limit
    if normalized_mode in ("lite", "delta"):
        query_limit = effective_limit + 1

    request_start = time.perf_counter()
    db_latency_ms: float = 0.0

    try:
        query_start = time.perf_counter()
        db_messages = crud.crud_message.get_messages_for_request(
            db,
            request_id,
            viewer,
            skip=skip,
            limit=query_limit,
            after_id=after_id,
            since=since,
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

    has_more = False
    if normalized_mode in ("lite", "delta") and len(db_messages) > effective_limit:
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

    include_reactions = normalized_mode != "lite"
    if include and not ("reactions" in include or "my_reactions" in include):
        include_reactions = False
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
    def _maybe_sign_attachment_url(val: Optional[str]) -> Optional[str]:
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

        # Sign attachment URL on the fly when pointing at private R2
        if data.get("attachment_url"):
            data["attachment_url"] = _maybe_sign_attachment_url(str(data.get("attachment_url") or ""))

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

    payload_probe = {
        **envelope_dict,
        "requested_since": since.isoformat() if isinstance(since, datetime) else None,
    }
    try:
        envelope_dict["payload_bytes"] = len(orjson.dumps(payload_probe))
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
            "mode": normalized_mode,
            "has_more": has_more,
            "requested_since": since.isoformat() if isinstance(since, datetime) else None,
            "user_id": current_user.id,
        },
    )

    return schemas.MessageListResponse(**envelope_dict)


@router.put("/booking-requests/{request_id}/messages/read")
async def mark_messages_read(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
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
        try:
            await manager.broadcast(
                request_id,
                {"v": 1, "type": "read", "up_to_id": last_unread, "user_id": current_user.id},
            )
        except Exception:  # pragma: no cover - broadcast best effort
            logger.exception("Failed to broadcast read receipt", extra={"request_id": request_id, "user_id": current_user.id})
    return {"updated": updated}


@router.post(
    "/booking-requests/{request_id}/messages", response_model=schemas.MessageResponse
)
def create_message(
    request_id: int,
    message_in: schemas.MessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
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

    # Best-effort idempotency: suppress accidental rapid duplicates
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
        system_key=message_in.system_key or sys_key,
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
        notify_user_new_message(
            db,
            other_user,
            current_user,
            request_id,
            message_in.content,
            message_in.message_type,
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
    background_tasks.add_task(
        manager.broadcast,
        request_id,
        data,
    )
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
        manager.broadcast(request_id, {"v": 1, "type": "message_deleted", "id": message_id})
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
        manager.broadcast(request_id, data)
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
        manager.broadcast(request_id, data)
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
