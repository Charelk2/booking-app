from collections import defaultdict
from sqlalchemy.orm import Session
from typing import Dict, List, Iterable
import re

from ..utils.messages import BOOKING_DETAILS_PREFIX, parse_booking_details

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
    """Return aggregated message notifications grouped by booking_request.

    Threads are returned even if all messages have been read; ``unread_count``
    simply becomes ``0`` when no unread notifications remain.
    """
    notifs = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == user_id,
            models.Notification.type == models.NotificationType.NEW_MESSAGE,
        )
        .order_by(models.Notification.timestamp.desc())
        .all()
    )

    threads: Dict[int, dict] = {}
    for n in notifs:
        match = re.search(r"(?:/booking-requests/|/inbox\?requestId=)(\d+)", n.link)
        if not match:
            continue
        request_id = int(match.group(1))

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
            avatar_url = None
            if other:
                name = f"{other.first_name} {other.last_name}"
                if other.user_type == models.UserType.SERVICE_PROVIDER:
                    profile = (
                        db.query(models.ServiceProviderProfile)
                        .filter(models.ServiceProviderProfile.user_id == other.id)
                        .first()
                    )
                    if profile:
                        if profile.business_name:
                            name = profile.business_name
                        if profile.profile_picture_url:
                            avatar_url = profile.profile_picture_url
                elif other.profile_picture_url:
                    avatar_url = other.profile_picture_url
            threads[request_id] = {
                "booking_request_id": request_id,
                "name": name,
                "unread_count": 0 if n.is_read else 1,
                "last_message": n.message,
                "link": n.link,
                "timestamp": n.timestamp,
                "avatar_url": avatar_url,
                "booking_details": None,
            }
            thread = threads[request_id]
        else:
            if not n.is_read:
                thread["unread_count"] += 1
            if n.timestamp > thread["timestamp"]:
                thread["last_message"] = n.message
                thread["timestamp"] = n.timestamp

        if thread.get("booking_details") is None:
            details_msg = (
                db.query(models.Message)
                .filter(
                    models.Message.booking_request_id == request_id,
                    models.Message.message_type == models.MessageType.SYSTEM,
                    models.Message.content.startswith(BOOKING_DETAILS_PREFIX),
                )
                .order_by(models.Message.timestamp.asc())
                .first()
            )
            if details_msg:
                thread["booking_details"] = {
                    "timestamp": details_msg.timestamp,
                    **parse_booking_details(details_msg.content),
                }

    # Batch fetch the earliest booking-details system message for all threads
    if threads:
        request_ids = list(threads.keys())
        details = (
            db.query(models.Message)
            .filter(
                models.Message.booking_request_id.in_(request_ids),
                models.Message.message_type == models.MessageType.SYSTEM,
                models.Message.content.startswith(BOOKING_DETAILS_PREFIX),
            )
            .order_by(
                models.Message.booking_request_id.asc(),
                models.Message.timestamp.asc(),
            )
            .all()
        )
        seen: set[int] = set()
        for m in details:
            rid = m.booking_request_id
            if rid in threads and rid not in seen:
                threads[rid]["booking_details"] = {
                    "timestamp": m.timestamp,
                    **parse_booking_details(m.content),
                }
                seen.add(rid)

    return sorted(threads.values(), key=lambda t: t["timestamp"], reverse=True)


def mark_thread_read(db: Session, user_id: int, booking_request_id: int) -> None:
    """Mark all message notifications for the given thread as read."""
    notifs: Iterable[models.Notification] = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == user_id,
            models.Notification.type == models.NotificationType.NEW_MESSAGE,
            models.Notification.link.in_([
                f"/booking-requests/{booking_request_id}",
                f"/inbox?requestId={booking_request_id}",
            ]),
            models.Notification.is_read == False,
        )
        .all()
    )
    for n in notifs:
        n.is_read = True
    db.commit()


def mark_all_read(db: Session, user_id: int) -> int:
    """Mark all notifications for a user as read.

    Returns the number of notifications updated.
    """
    updated = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == user_id,
            models.Notification.is_read == False,
        )
        .update({"is_read": True}, synchronize_session="fetch")
    )
    db.commit()
    return int(updated)
