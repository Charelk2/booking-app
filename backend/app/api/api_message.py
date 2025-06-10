from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    UploadFile,
    File,
    BackgroundTasks,
)
from sqlalchemy.orm import Session
from typing import List

from .. import crud, models, schemas
from .dependencies import get_db, get_current_user
from ..utils.notifications import notify_user_new_message
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
):
    booking_request = crud.crud_booking_request.get_booking_request(
        db, request_id=request_id
    )
    if not booking_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found"
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access messages",
        )
    return crud.crud_message.get_messages_for_request(db, request_id)


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found"
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to send message",
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

    msg = crud.crud_message.create_message(
        db,
        booking_request_id=request_id,
        sender_id=sender_id,
        sender_type=sender_type,
        content=message_in.content,
        message_type=message_in.message_type,
        quote_id=message_in.quote_id,
        attachment_url=message_in.attachment_url,
    )
    other_user_id = (
        booking_request.artist_id
        if sender_type == models.SenderType.CLIENT
        else booking_request.client_id
    )
    other_user = db.query(models.User).filter(models.User.id == other_user_id).first()
    if other_user:
        notify_user_new_message(db, other_user, request_id, message_in.content)
    background_tasks.add_task(
        manager.broadcast,
        request_id,
        schemas.MessageResponse.model_validate(msg).model_dump(),
    )
    return msg


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found"
        )
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to upload attachment",
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
