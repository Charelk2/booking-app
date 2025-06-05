from collections import defaultdict
from sqlalchemy.orm import Session
from typing import Dict, List

from .. import models


def create_notification(
    db: Session,
    user_id: int,
    type: models.NotificationType,
    message: str,
    link: str,
) -> models.Notification:
    db_obj = models.Notification(
        user_id=user_id, type=type, message=message, link=link
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_notifications_for_user(
    db: Session, user_id: int, skip: int = 0, limit: int | None = None
) -> List[models.Notification]:
    """Return notifications ordered by timestamp with optional pagination."""
    query = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user_id)
        .order_by(models.Notification.timestamp.desc())
    )
    if skip:
        query = query.offset(skip)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


def get_notifications_grouped_by_type(
    db: Session, user_id: int
) -> Dict[str, List[models.Notification]]:
    """Return notifications grouped by their type."""
    all_notifs = get_notifications_for_user(db, user_id)
    grouped: Dict[str, List[models.Notification]] = defaultdict(list)
    for n in all_notifs:
        grouped[n.type.value].append(n)
    return grouped


def get_notification(db: Session, notification_id: int) -> models.Notification | None:
    return db.query(models.Notification).filter(models.Notification.id == notification_id).first()


def mark_as_read(db: Session, db_notification: models.Notification) -> models.Notification:
    db_notification.is_read = True
    db.commit()
    db.refresh(db_notification)
    return db_notification
