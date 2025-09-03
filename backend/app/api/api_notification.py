from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
import enum
import logging
import re

from .. import models, schemas, crud
from .dependencies import get_db, get_current_user
from ..utils import error_response
from ..utils.notifications import _build_response

router = APIRouter(tags=["notifications"])

logger = logging.getLogger(__name__)


@router.get("/notifications", response_model=List[schemas.NotificationResponse])
def read_my_notifications(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Retrieve notifications for the current user with pagination."""
    notifs = crud.crud_notification.get_notifications_for_user(
        db, current_user.id, skip=skip, limit=limit
    )
    return [_build_response(db, n) for n in notifs]


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
        raise error_response(
            "Notification not found",
            {"notification_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    updated = crud.crud_notification.mark_as_read(db, db_notif)
    return _build_response(db, updated)


@router.get(
    "/notifications/message-threads",
    response_model=List[schemas.ThreadNotificationResponse],
)
def read_message_threads(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Retrieve unread message notifications grouped by chat thread."""
    return crud.crud_notification.get_message_thread_notifications(db, current_user.id)


@router.put("/notifications/message-threads/{booking_request_id}/read")
def mark_thread_read(
    booking_request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark all message notifications for the thread as read."""
    crud.crud_notification.mark_thread_read(db, current_user.id, booking_request_id)
    return {"booking_request_id": booking_request_id}


@router.put("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark all notifications as read for the current user."""
    updated = crud.crud_notification.mark_all_read(db, current_user.id)
    return {"updated": updated}
