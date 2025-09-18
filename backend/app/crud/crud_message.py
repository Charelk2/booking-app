from typing import Dict, List
from datetime import datetime

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

from .. import models, schemas


def create_message(
    db: Session,
    booking_request_id: int,
    sender_id: int,
    sender_type: models.SenderType,
    content: str | None,
    message_type: models.MessageType = models.MessageType.USER,
    visible_to: models.VisibleTo = models.VisibleTo.BOTH,
    quote_id: int | None = None,
    attachment_url: str | None = None,
    attachment_meta: dict | None = None,
    action: models.MessageAction | None = None,
    system_key: str | None = None,
    expires_at: datetime | None = None,
) -> models.Message:
    """Create a message; for SYSTEM messages with ``system_key`` perform UPSERT.

    If a system message with the same ``(booking_request_id, system_key)``
    already exists, return the existing row to avoid duplicates. We keep the
    earliest message stable (so summaries remain consistent) and do not update
    content on subsequent calls.
    """
    if message_type == models.MessageType.SYSTEM and system_key:
        existing = (
            db.query(models.Message)
            .filter(
                models.Message.booking_request_id == booking_request_id,
                models.Message.system_key == system_key,
            )
            .order_by(models.Message.timestamp.asc())
            .first()
        )
        if existing:
            return existing

    db_msg = models.Message(
        booking_request_id=booking_request_id,
        sender_id=sender_id,
        sender_type=sender_type,
        content=(content or ""),
        message_type=message_type,
        visible_to=visible_to,
        quote_id=quote_id,
        attachment_url=attachment_url,
        attachment_meta=attachment_meta,
        action=action,
        system_key=system_key,
        expires_at=expires_at,
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg


def get_messages_for_request(
    db: Session,
    booking_request_id: int,
    viewer: models.VisibleTo | None = None,
    skip: int = 0,
    limit: int = 100,
    after_id: int | None = None,
) -> List[models.Message]:
    query = (
        db.query(models.Message)
        .options(
            joinedload(models.Message.sender).joinedload(models.User.artist_profile)
        )
        .filter(models.Message.booking_request_id == booking_request_id)
    )
    if viewer:
        query = query.filter(
            models.Message.visible_to.in_([models.VisibleTo.BOTH, viewer])
        )
    if after_id:
        query = query.filter(models.Message.id > after_id)
    query = (
        query.order_by(models.Message.timestamp.asc())
        .offset(skip)
        .limit(limit)
    )
    return query.all()


def get_last_message_for_request(db: Session, booking_request_id: int) -> models.Message | None:
    """Return the most recent message for the given booking request."""
    return (
        db.query(models.Message)
        .filter(models.Message.booking_request_id == booking_request_id)
        .order_by(models.Message.timestamp.desc())
        .first()
    )


def get_last_messages_for_requests(
    db: Session,
    booking_request_ids: List[int],
) -> Dict[int, models.Message]:
    """Return the latest message for each booking request in one query."""
    if not booking_request_ids:
        return {}

    window = (
        db.query(
            models.Message.booking_request_id.label("br_id"),
            models.Message.id.label("message_id"),
            func.row_number()
            .over(
                partition_by=models.Message.booking_request_id,
                order_by=models.Message.timestamp.desc(),
            )
            .label("rn"),
        )
        .filter(models.Message.booking_request_id.in_(booking_request_ids))
        .subquery()
    )

    latest_ids = (
        db.query(window.c.br_id, window.c.message_id)
        .filter(window.c.rn == 1)
        .all()
    )

    message_ids = [row.message_id for row in latest_ids if row.message_id is not None]
    if not message_ids:
        return {}

    messages = (
        db.query(models.Message)
        .filter(models.Message.id.in_(message_ids))
        .all()
    )

    return {m.booking_request_id: m for m in messages}


def get_recent_messages_for_request(
    db: Session,
    booking_request_id: int,
    limit: int = 5,
) -> List[models.Message]:
    """Return the latest ``limit`` messages for a request (newest first)."""
    if limit <= 0:
        return []
    rows = (
        db.query(models.Message)
        .filter(models.Message.booking_request_id == booking_request_id)
        .order_by(models.Message.timestamp.desc())
        .limit(limit)
        .all()
    )
    return rows


def get_payment_received_booking_request_ids(
    db: Session,
    booking_request_ids: List[int],
) -> set[int]:
    """Return booking request ids that contain a payment-received system line."""
    if not booking_request_ids:
        return set()

    rows = (
        db.query(models.Message.booking_request_id)
        .filter(models.Message.booking_request_id.in_(booking_request_ids))
        .filter(
            or_(
                models.Message.system_key.ilike("payment_received%"),
                func.lower(func.trim(models.Message.content)).like("payment received%"),
            )
        )
        .distinct()
        .all()
    )

    return {int(row[0]) for row in rows if row[0] is not None}


def mark_messages_read(db: Session, booking_request_id: int, user_id: int) -> int:
    """Mark all messages sent by the other user as read."""
    updated = (
        db.query(models.Message)
        .filter(
            models.Message.booking_request_id == booking_request_id,
            models.Message.sender_id != user_id,
            models.Message.is_read.is_(False),
        )
        .update({"is_read": True}, synchronize_session="fetch")
    )
    db.commit()
    return int(updated)


def delete_message(db: Session, message_id: int) -> bool:
    """Delete a single message by id.

    Returns True if a row was deleted, False otherwise.
    """
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        return False
    db.delete(msg)
    db.commit()
    return True
