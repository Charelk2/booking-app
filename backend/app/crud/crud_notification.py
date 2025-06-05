from collections import defaultdict
from sqlalchemy.orm import Session
from typing import Dict, List, Iterable

from datetime import datetime

from .. import models


def create_notification(
    db: Session,
    user_id: int,
    type: models.NotificationType,
    message: str,
    link: str,
) -> models.Notification:
    db_obj = models.Notification(user_id=user_id, type=type, message=message, link=link)
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
    return (
        db.query(models.Notification)
        .filter(models.Notification.id == notification_id)
        .first()
    )


def mark_as_read(
    db: Session, db_notification: models.Notification
) -> models.Notification:
    db_notification.is_read = True
    db.commit()
    db.refresh(db_notification)
    return db_notification


def get_message_thread_notifications(db: Session, user_id: int) -> List[dict]:
    """Return aggregated unread message notifications grouped by booking_request."""
    unread = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == user_id,
            models.Notification.type == models.NotificationType.NEW_MESSAGE,
            models.Notification.is_read == False,
        )
        .order_by(models.Notification.timestamp.desc())
        .all()
    )

    threads: Dict[int, dict] = {}
    for n in unread:
        try:
            request_id = int(n.link.split("/")[-1])
        except (IndexError, ValueError):
            continue

        thread = threads.get(request_id)
        if thread is None:
            br = (
                db.query(models.BookingRequest)
                .filter(models.BookingRequest.id == request_id)
                .first()
            )
            if br is None:
                continue
            other_id = br.client_id if br.artist_id == user_id else br.artist_id
            other = db.query(models.User).filter(models.User.id == other_id).first()
            name = "Unknown"
            if other:
                name = f"{other.first_name} {other.last_name}"
                if other.user_type == models.UserType.ARTIST:
                    profile = (
                        db.query(models.ArtistProfile)
                        .filter(models.ArtistProfile.user_id == other.id)
                        .first()
                    )
                    if profile and profile.business_name:
                        name = profile.business_name
            threads[request_id] = {
                "booking_request_id": request_id,
                "name": name,
                "unread_count": 1,
                "last_message": n.message,
                "link": n.link,
                "timestamp": n.timestamp,
            }
        else:
            thread["unread_count"] += 1
            if n.timestamp > thread["timestamp"]:
                thread["last_message"] = n.message
                thread["timestamp"] = n.timestamp

    return sorted(threads.values(), key=lambda t: t["timestamp"], reverse=True)


def mark_thread_read(db: Session, user_id: int, booking_request_id: int) -> None:
    """Mark all message notifications for the given thread as read."""
    notifs: Iterable[models.Notification] = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == user_id,
            models.Notification.type == models.NotificationType.NEW_MESSAGE,
            models.Notification.link == f"/booking-requests/{booking_request_id}",
            models.Notification.is_read == False,
        )
        .all()
    )
    for n in notifs:
        n.is_read = True
    db.commit()
