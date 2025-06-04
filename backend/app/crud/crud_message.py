from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas


def create_message(
    db: Session,
    booking_request_id: int,
    sender_id: int,
    sender_type: models.SenderType,
    content: str,
    message_type: models.MessageType = models.MessageType.TEXT,
    quote_id: int | None = None,
) -> models.Message:
    db_msg = models.Message(
        booking_request_id=booking_request_id,
        sender_id=sender_id,
        sender_type=sender_type,
        content=content,
        message_type=message_type,
        quote_id=quote_id,
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg


def get_messages_for_request(db: Session, booking_request_id: int) -> List[models.Message]:
    return (
        db.query(models.Message)
        .filter(models.Message.booking_request_id == booking_request_id)
        .order_by(models.Message.timestamp.asc())
        .all()
    )
