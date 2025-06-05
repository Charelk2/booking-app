from sqlalchemy.orm import Session
from typing import List

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


def get_notifications_for_user(db: Session, user_id: int) -> List[models.Notification]:
    return (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user_id)
        .order_by(models.Notification.timestamp.desc())
        .all()
    )


def get_notification(db: Session, notification_id: int) -> models.Notification | None:
    return db.query(models.Notification).filter(models.Notification.id == notification_id).first()


def mark_as_read(db: Session, db_notification: models.Notification) -> models.Notification:
    db_notification.is_read = True
    db.commit()
    db.refresh(db_notification)
    return db_notification
