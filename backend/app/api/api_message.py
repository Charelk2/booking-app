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
from typing import List, Optional
from datetime import datetime, timezone

from .. import crud, models, schemas
from .dependencies import get_db, get_current_user
from ..utils.notifications import (
    notify_user_new_message,
    notify_user_new_booking_request,
    VIDEO_FLOW_READY_MESSAGE,
)
from ..utils.messages import BOOKING_DETAILS_PREFIX, preview_label_for_message
from ..utils import error_response
from .api_ws import manager
import os
import mimetypes
import uuid
import shutil
from pydantic import BaseModel

router = APIRouter(tags=["messages"])

DEFAULT_ATTACHMENTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "static", "attachments")
)
ATTACHMENTS_DIR = os.getenv("ATTACHMENTS_DIR", DEFAULT_ATTACHMENTS_DIR)
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)


@router.get(
    "/booking-requests/{request_id}/messages",
    response_model=List[schemas.MessageResponse],
)
def read_messages(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    after_id: Optional[int] = Query(
        None,
        ge=0,
        description="Return only messages with an id greater than this value",
    ),
    fields: Optional[str] = Query(
        None, description="Comma-separated fields to include in the response"
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
    if hasattr(skip, "default"):
        skip = skip.default
    if hasattr(limit, "default"):
        limit = limit.default
    if hasattr(fields, "default"):
        fields = None

    try:
        db_messages = crud.crud_message.get_messages_for_request(
            db,
            request_id,
            viewer,
            skip=skip,
            limit=limit,
            after_id=after_id,
        )
    except Exception as exc:
        # Defensive logging to diagnose unexpected DB shape mismatches in the field
        import logging
        from sqlalchemy import inspect
        logger = logging.getLogger(__name__)
        try:
            insp = inspect(db.get_bind())
            cols = []
            if 'messages' in insp.get_table_names():
                cols = [c['name'] for c in insp.get_columns('messages')]
            logger.exception(
                "Failed to load messages for request %s; columns=%s error=%s",
                request_id,
                cols,
                exc,
            )
        except Exception:
            logger.exception("Failed to inspect messages table after error: %s", exc)
        # Do not block the UI; return an empty list so the thread can render
        return []
    include = None
    if fields:
        include = {
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
        include.update({f.strip() for f in fields.split(",") if f.strip()})
    # Preload reactions for all messages (best-effort)
    ids = [m.id for m in db_messages]
    try:
        aggregates = (
            crud.crud_message_reaction.get_reaction_aggregates(db, ids) if ids else {}
        )
        my = (
            crud.crud_message_reaction.get_user_reactions(db, ids, current_user.id)
            if ids
            else {}
        )
    except Exception:
        # If the reactions table is missing or a transient error occurs,
        # continue rendering messages without reactions.
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

    result = []
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
        # Server-computed preview label for uniform clients
        try:
            data["preview_label"] = preview_label_for_message(m)
            # Provide a coarse preview_key/args so clients can unify previews
            key = None
            if m.message_type == models.MessageType.QUOTE:
                key = "quote"
            elif m.system_key:
                # normalize known keys
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
            data["preview_args"] = {}
        except Exception:
            data["preview_label"] = None
        # Reply preview
        if m.reply_to_message_id:
            parent = (
                db.query(models.Message)
                .filter(models.Message.id == m.reply_to_message_id)
                .first()
            )
            if parent:
                data["reply_to_message_id"] = parent.id
                data["reply_to_preview"] = parent.content[:160]
        # Reactions aggregates
        if m.id in aggregates:
            data["reactions"] = aggregates[m.id]
        if m.id in my:
            data["my_reactions"] = my[m.id]
        if include is not None:
            data = {k: v for k, v in data.items() if k in include}
        result.append(data)
    return result


@router.put("/booking-requests/{request_id}/messages/read")
def mark_messages_read(
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
    updated = crud.crud_message.mark_messages_read(db, request_id, current_user.id)
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
