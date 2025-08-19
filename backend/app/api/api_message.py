from fastapi import (
    APIRouter,
    Depends,
    status,
    UploadFile,
    File,
    BackgroundTasks,
    Query,
)
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import crud, models, schemas
from .dependencies import get_db, get_current_user
from ..utils.notifications import (
    notify_user_new_message,
    notify_user_new_booking_request,
    VIDEO_FLOW_READY_MESSAGE,
)
from ..utils.messages import BOOKING_DETAILS_PREFIX
from ..utils import error_response
from .api_ws import manager
import os
import uuid
import shutil

router = APIRouter(tags=["messages"])

ATTACHMENTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "static", "attachments")
)
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
            db, request_id, viewer, skip=skip, limit=limit
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
        }
        include.update({f.strip() for f in fields.split(",") if f.strip()})
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
        data = schemas.MessageResponse.model_validate(m).model_dump()
        data["avatar_url"] = avatar_url
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
    # Validate: disallow empty content to avoid blank bubbles in UI
    if not message_in.content or not message_in.content.strip():
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
        action=message_in.action,
        system_key=message_in.system_key or sys_key,
        expires_at=message_in.expires_at,
    )
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
    background_tasks.add_task(
        manager.broadcast,
        request_id,
        data,
    )
    return data


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
