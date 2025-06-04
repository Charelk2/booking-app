from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import crud, models, schemas
from .dependencies import get_db, get_current_user
from ..utils.notifications import notify_user_new_message

router = APIRouter(tags=["messages"])


@router.get("/booking-requests/{request_id}/messages", response_model=List[schemas.MessageResponse])
def read_messages(request_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found")
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access messages")
    return crud.crud_message.get_messages_for_request(db, request_id)


@router.post("/booking-requests/{request_id}/messages", response_model=schemas.MessageResponse)
def create_message(request_id: int, message_in: schemas.MessageCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    booking_request = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    if not booking_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking request not found")
    if current_user.id not in [booking_request.client_id, booking_request.artist_id]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to send message")
    sender_type = models.SenderType.CLIENT if current_user.id == booking_request.client_id else models.SenderType.ARTIST
    msg = crud.crud_message.create_message(db, request_id, current_user.id, sender_type, message_in.content)
    other_user_id = booking_request.artist_id if sender_type == models.SenderType.CLIENT else booking_request.client_id
    other_user = db.query(models.User).filter(models.User.id == other_user_id).first()
    if other_user:
        notify_user_new_message(other_user, message_in.content)
    return msg
