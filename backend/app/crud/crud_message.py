from typing import List

from sqlalchemy.orm import Session

from .. import models, schemas


def create_message(
    db: Session,
    booking_request_id: int,
    sender_id: int,
    sender_type: models.SenderType,
    content: str,
    message_type: models.MessageType = models.MessageType.USER,
    visible_to: models.VisibleTo = models.VisibleTo.BOTH,
    quote_id: int | None = None,
    attachment_url: str | None = None,
    action: models.MessageAction | None = None,
) -> models.Message:
    db_msg = models.Message(
        booking_request_id=booking_request_id,
        sender_id=sender_id,
        sender_type=sender_type,
        content=content,
        message_type=message_type,
        visible_to=visible_to,
        quote_id=quote_id,
        attachment_url=attachment_url,
        action=action,
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg


def get_messages_for_request(
    db: Session, booking_request_id: int, viewer: models.VisibleTo | None = None
) -> List[models.Message]:
    query = (
        db.query(models.Message)
        .filter(models.Message.booking_request_id == booking_request_id)
        .order_by(models.Message.timestamp.asc())
    )
    if viewer:
        query = query.filter(
            models.Message.visible_to.in_([models.VisibleTo.BOTH, viewer])
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
