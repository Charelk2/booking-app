from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func
from typing import List, Optional

from .. import models
from .. import schemas

# --- BookingRequest CRUD ---_REQUEST

def create_booking_request(
    db: Session,
    booking_request: schemas.BookingRequestCreate,
    client_id: int
) -> models.BookingRequest:
    db_booking_request = models.BookingRequest(
        **booking_request.model_dump(exclude={"status"}),
        client_id=client_id,
        status=booking_request.status
        or models.BookingRequestStatus.PENDING_QUOTE,
    )
    db.add(db_booking_request)
    db.commit()
    db.refresh(db_booking_request)
    return db_booking_request

def get_booking_request(db: Session, request_id: int) -> Optional[models.BookingRequest]:
    return (
        db.query(models.BookingRequest)
        .options(joinedload(models.BookingRequest.quotes))
        .filter(models.BookingRequest.id == request_id)
        .first()
    )

def get_booking_requests_by_client(db: Session, client_id: int, skip: int = 0, limit: int = 100) -> List[models.BookingRequest]:
    return (
        db.query(models.BookingRequest)
        .options(joinedload(models.BookingRequest.quotes))
        .filter(models.BookingRequest.client_id == client_id)
        .order_by(models.BookingRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_booking_requests_by_artist(db: Session, artist_id: int, skip: int = 0, limit: int = 100) -> List[models.BookingRequest]:
    return (
        db.query(models.BookingRequest)
        .options(joinedload(models.BookingRequest.quotes))
        .filter(models.BookingRequest.artist_id == artist_id)
        .order_by(models.BookingRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def update_booking_request(
    db: Session, 
    db_booking_request: models.BookingRequest,
    request_update: schemas.BookingRequestUpdateByClient | schemas.BookingRequestUpdateByArtist
) -> models.BookingRequest:
    update_data = request_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_booking_request, key, value)
    db.commit()
    db.refresh(db_booking_request)
    return db_booking_request

# Potentially a delete function if needed, though usually requests are archived or status changed
# def delete_booking_request(db: Session, request_id: int):
#     db_booking_request = db.query(models.BookingRequest).filter(models.BookingRequest.id == request_id).first()
#     if db_booking_request:
#         db.delete(db_booking_request)
#         db.commit()
#     return db_booking_request


def get_booking_requests_with_last_message(
    db: Session,
    *,
    client_id: int | None = None,
    artist_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
) -> List[models.BookingRequest]:
    """Return booking requests with their latest chat message.

    This helper eager loads related client, artist, service and quotes models and
    attaches ``last_message_content`` and ``last_message_timestamp`` attributes to
    each ``BookingRequest`` instance without triggering N+1 queries.
    """

    if client_id is None and artist_id is None:
        raise ValueError("client_id or artist_id must be provided")

    latest_msg_window = (
        select(
            models.Message.booking_request_id.label("br_id"),
            models.Message.content.label("last_message_content"),
            models.Message.timestamp.label("last_message_timestamp"),
            func.row_number()
            .over(
                partition_by=models.Message.booking_request_id,
                order_by=models.Message.timestamp.desc(),
            )
            .label("rn"),
        )
    ).subquery()

    latest_msg = (
        select(
            latest_msg_window.c.br_id,
            latest_msg_window.c.last_message_content,
            latest_msg_window.c.last_message_timestamp,
        )
        .where(latest_msg_window.c.rn == 1)
        .subquery()
    )

    query = (
        db.query(models.BookingRequest)
        .options(
            joinedload(models.BookingRequest.client),
            joinedload(models.BookingRequest.artist),
            joinedload(models.BookingRequest.service),
            joinedload(models.BookingRequest.quotes),
        )
        .outerjoin(latest_msg, models.BookingRequest.id == latest_msg.c.br_id)
        .add_columns(
            latest_msg.c.last_message_content,
            latest_msg.c.last_message_timestamp,
        )
    )

    if client_id is not None:
        query = query.filter(models.BookingRequest.client_id == client_id)
    if artist_id is not None:
        query = query.filter(models.BookingRequest.artist_id == artist_id)

    rows = (
        query.order_by(models.BookingRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    results: List[models.BookingRequest] = []
    for br, content, timestamp in rows:
        setattr(br, "last_message_content", content)
        setattr(br, "last_message_timestamp", timestamp)
        accepted = next(
            (
                q
                for q in br.quotes
                if q.status
                in [
                    models.QuoteStatus.ACCEPTED_BY_CLIENT,
                    models.QuoteStatus.CONFIRMED_BY_ARTIST,
                ]
            ),
            None,
        )
        if accepted:
            setattr(br, "accepted_quote_id", accepted.id)
        results.append(br)

    return results
