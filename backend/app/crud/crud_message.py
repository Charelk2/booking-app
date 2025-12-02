from typing import Dict, List, Optional, Tuple
from datetime import datetime

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_, and_

from .. import models, schemas


DELETED_SYSTEM_KEY = "message_deleted_v1"
DELETED_CONTENT = "This message was deleted."


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
    before_id: int | None = None,
    since: datetime | None = None,
    newest_first: bool = False,
) -> List[models.Message]:
    query = (
        db.query(models.Message)
        .options(
            selectinload(models.Message.sender)
            .load_only(
                models.User.id,
                models.User.first_name,
                models.User.last_name,
                models.User.profile_picture_url,
                models.User.user_type,
            )
            .selectinload(models.User.artist_profile)
            .load_only(
                models.ServiceProviderProfile.user_id,
                models.ServiceProviderProfile.business_name,
                models.ServiceProviderProfile.profile_picture_url,
            )
        )
        .filter(models.Message.booking_request_id == booking_request_id)
    )
    if viewer:
        query = query.filter(
            models.Message.visible_to.in_([models.VisibleTo.BOTH, viewer])
        )
    if after_id:
        query = query.filter(models.Message.id > after_id)
    if before_id:
        query = query.filter(models.Message.id < before_id)
    if since:
        query = query.filter(models.Message.timestamp >= since)
    # Choose an ORDER BY that aligns with available indexes.
    # - For cursored reads (after_id / before_id), order by id to use the
    #   (booking_request_id, id) composite index efficiently.
    #   • after_id: ascending (append newer messages)
    #   • before_id: descending (grab older page efficiently; caller may reverse)
    # - For first page (no cursors), keep timestamp order (newest_first ⇒ desc).
    if after_id is not None:
        ordered = query.order_by(models.Message.id.asc())
    elif before_id is not None:
        ordered = query.order_by(models.Message.id.desc())
    else:
        # For first page (no cursors), use id DESC to align with (booking_request_id, id) index,
        # then the caller can reverse to oldest→newest for the client.
        ordered = query.order_by(models.Message.id.desc())
    query = ordered.offset(skip).limit(limit)
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


def get_recent_messages_for_requests(
    db: Session,
    booking_request_ids: List[int],
    per_request: int = 5,
) -> Dict[int, List[models.Message]]:
    """Return up to ``per_request`` most recent messages for each booking request.

    Uses a window function so results arrive in a single round-trip instead of
    issuing a follow-up query per booking request.
    """

    if not booking_request_ids or per_request <= 0:
        return {}

    window = (
        db.query(
            models.Message.booking_request_id.label('br_id'),
            models.Message.id.label('message_id'),
            func.row_number()
            .over(
                partition_by=models.Message.booking_request_id,
                order_by=models.Message.timestamp.desc(),
            )
            .label('rn'),
        )
        .filter(models.Message.booking_request_id.in_(booking_request_ids))
        .subquery()
    )

    recent_ids = (
        db.query(window.c.br_id, window.c.message_id, window.c.rn)
        .filter(window.c.rn <= per_request)
        .all()
    )

    message_ids = [row.message_id for row in recent_ids if row.message_id is not None]
    if not message_ids:
        return {}

    messages = (
        db.query(models.Message)
        .filter(models.Message.id.in_(message_ids))
        .all()
    )

    grouped: Dict[int, List[models.Message]] = {int(bid): [] for bid in booking_request_ids}
    # Ensure newest first ordering per booking request using rn ordering
    by_id = {msg.id: msg for msg in messages}
    for row in sorted(recent_ids, key=lambda r: (int(r.br_id), int(r.rn))):
        msg = by_id.get(row.message_id)
        if msg is None:
            continue
        grouped.setdefault(int(row.br_id), []).append(msg)
    for key in grouped:
        grouped[key].sort(key=lambda m: m.timestamp or datetime.min, reverse=True)
    return grouped


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


def get_last_unread_message_id(
    db: Session, booking_request_id: int, user_id: int
) -> Optional[int]:
    """Return the highest message id still unread by the viewer."""
    row = (
        db.query(func.max(models.Message.id))
        .filter(models.Message.booking_request_id == booking_request_id)
        .filter(models.Message.sender_id != user_id)
        .filter(
            or_(
                models.Message.is_read.is_(False),
                models.Message.is_read.is_(None),
            )
        )
        .scalar()
    )
    if row is None:
        return None
    try:
        return int(row)
    except (TypeError, ValueError):
        return None


def mark_messages_read(db: Session, booking_request_id: int, user_id: int) -> int:
    """Mark all messages sent by the other user as read."""
    unread_filter = or_(
        models.Message.is_read.is_(False),
        models.Message.is_read.is_(None),
    )
    updated = (
        db.query(models.Message)
        .filter(
            models.Message.booking_request_id == booking_request_id,
            models.Message.sender_id != user_id,
            unread_filter,
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


def mark_message_deleted(msg: models.Message) -> None:
    """Transform a message row into a tombstone instead of hard-deleting it.

    This keeps ordering and read receipts consistent while ensuring the original
    content/attachments are no longer exposed.
    """
    try:
        # Idempotent: if it's already a tombstone, do nothing.
        if (
            msg.message_type == models.MessageType.SYSTEM
            and (msg.system_key or "").startswith("message_deleted")
        ):
            return
    except Exception:
        # Best-effort; if enums misbehave, fall back to simple mutation below.
        pass

    msg.message_type = models.MessageType.SYSTEM
    msg.system_key = DELETED_SYSTEM_KEY
    msg.content = DELETED_CONTENT
    msg.visible_to = models.VisibleTo.BOTH

    # Clear payload / linkage fields so no original content leaks.
    msg.attachment_url = None
    msg.attachment_meta = None
    msg.quote_id = None
    msg.action = None
    msg.expires_at = None
    msg.reply_to_message_id = None


def is_deleted_message(msg: models.Message) -> bool:
    """Return True when a message row represents a deletion tombstone."""
    try:
        return (
            msg.message_type == models.MessageType.SYSTEM
            and (msg.system_key or "").startswith("message_deleted")
        )
    except Exception:
        return False


def get_unread_counts_for_user_threads(
    db: Session,
    user_id: int,
    thread_ids: Optional[List[int]] = None,
) -> Dict[int, int]:
    """Compute unread counts per thread based on messages table.

    Unread = messages in a thread where:
      - the booking request involves the user (as artist or client)
      - the message sender is NOT the user
      - the message is not read (is_read is False or NULL)

    Optionally limit to a subset of ``thread_ids`` to reduce workload.
    """
    from .. import models

    query = (
        db.query(models.Message.booking_request_id, func.count(models.Message.id))
        .join(
            models.BookingRequest,
            models.BookingRequest.id == models.Message.booking_request_id,
        )
        .filter(
            or_(
                models.BookingRequest.client_id == user_id,
                models.BookingRequest.artist_id == user_id,
            )
        )
        .filter(models.Message.sender_id != user_id)
        .filter(or_(models.Message.is_read.is_(False), models.Message.is_read.is_(None)))
    )
    if thread_ids:
        query = query.filter(models.Message.booking_request_id.in_(thread_ids))

    rows = query.group_by(models.Message.booking_request_id).all()
    out: Dict[int, int] = {}
    for bid, cnt in rows:
        try:
            out[int(bid)] = int(cnt or 0)
        except Exception:
            continue
    return out


def get_unread_message_totals_for_user(
    db: Session, user_id: int
) -> Tuple[int, datetime | None]:
    """Return total unread messages and the latest unread timestamp for the user.

    This aggregates across all threads the user participates in and only
    considers messages sent by the other party.
    """
    from .. import models

    count, latest_ts = (
        db.query(
            func.count(models.Message.id),
            func.max(models.Message.timestamp),
        )
        .join(
            models.BookingRequest,
            models.BookingRequest.id == models.Message.booking_request_id,
        )
        .filter(
            or_(
                models.BookingRequest.client_id == user_id,
                models.BookingRequest.artist_id == user_id,
            )
        )
        .filter(models.Message.sender_id != user_id)
        .filter(or_(models.Message.is_read.is_(False), models.Message.is_read.is_(None)))
        .one()
    )
    return int(count or 0), latest_ts
