from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models
from ..dependencies import get_db, get_current_user

router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/notifications")
async def list_notifications(
    unreadOnly: bool = False,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List notifications for the current user."""
    # TODO: query DB and serialize
    return []


@router.patch("/notifications/{id}")
async def mark_read(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark a notification as read."""
    # TODO: update read flag
    return {"id": id}


@router.patch("/notifications/mark-all-read")
async def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark all notifications as read."""
    # TODO: batch update
    return {"status": "ok"}


@router.delete("/notifications/{id}")
async def delete_notification(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a notification."""
    # TODO: delete row
    return {"id": id}
