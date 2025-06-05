from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas, crud
from .dependencies import get_db, get_current_user

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=List[schemas.NotificationResponse])
def read_my_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Retrieve notifications for the current user."""
    return crud.crud_notification.get_notifications_for_user(db, current_user.id)


@router.put(
    "/notifications/{notification_id}/read",
    response_model=schemas.NotificationResponse,
)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark a notification as read."""
    db_notif = crud.crud_notification.get_notification(db, notification_id)
    if not db_notif or db_notif.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return crud.crud_notification.mark_as_read(db, db_notif)
