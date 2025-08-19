from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func
from typing import List, Optional

from .. import models
from .. import schemas
from . import crud_message
from ..utils.messages import preview_label_for_message
from ..utils.messages import BOOKING_DETAILS_PREFIX

# --- BookingRequest CRUD ---_REQUEST

def create_booking_request(
    db: Session,
    booking_request: schemas.BookingRequestCreate,
    client_id: int
) -> models.BookingRequest:
    db_booking_request = models.BookingRequest(
        **booking_request.model_dump(exclude={"status"}),
        client_id=client_id,
        status=booking_request.status or models.BookingStatus.PENDING_QUOTE,
    )
    db.add(db_booking_request)
    return db_booking_request

def get_booking_request(db: Session, request_id: int) -> Optional[models.BookingRequest]:
    db_request = (
        db.query(models.BookingRequest)
        .options(
            joinedload(models.BookingRequest.client),
            joinedload(models.BookingRequest.artist).joinedload(models.User.artist_profile),
            joinedload(models.BookingRequest.service).joinedload(models.Service.artist),
            joinedload(models.BookingRequest.quotes)
            .joinedload(models.Quote.artist)
            .joinedload(models.User.artist_profile),
        )
        .filter(models.BookingRequest.id == request_id)
        .first()
    )

    if db_request and db_request.artist and db_request.artist.artist_profile:
        setattr(db_request, "artist_profile", db_request.artist.artist_profile)
    if db_request:
        for q in db_request.quotes:
            if q.artist and q.artist.artist_profile:
                setattr(q, "artist_profile", q.artist.artist_profile)
    return db_request

def get_booking_requests_by_client(db: Session, client_id: int, skip: int = 0, limit: int = 100) -> List[models.BookingRequest]:
    rows = (
        db.query(models.BookingRequest)
        .options(
            joinedload(models.BookingRequest.client),
            joinedload(models.BookingRequest.artist).joinedload(models.User.artist_profile),
            joinedload(models.BookingRequest.service).joinedload(models.Service.artist),
            joinedload(models.BookingRequest.quotes)
            .joinedload(models.Quote.artist)
            .joinedload(models.User.artist_profile),
        )
        .filter(models.BookingRequest.client_id == client_id)
        .order_by(models.BookingRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for br in rows:
        if br.artist and br.artist.artist_profile:
            setattr(br, "artist_profile", br.artist.artist_profile)
        for q in br.quotes:
            if q.artist and q.artist.artist_profile:
                setattr(q, "artist_profile", q.artist.artist_profile)
    return rows

def get_booking_requests_by_artist(db: Session, artist_id: int, skip: int = 0, limit: int = 100) -> List[models.BookingRequest]:
    rows = (
        db.query(models.BookingRequest)
        .options(
            joinedload(models.BookingRequest.client),
            joinedload(models.BookingRequest.artist).joinedload(models.User.artist_profile),
            joinedload(models.BookingRequest.service).joinedload(models.Service.artist),
            joinedload(models.BookingRequest.quotes)
            .joinedload(models.Quote.artist)
            .joinedload(models.User.artist_profile),
        )
        .filter(models.BookingRequest.artist_id == artist_id)
        .order_by(models.BookingRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for br in rows:
        if br.artist and br.artist.artist_profile:
            setattr(br, "artist_profile", br.artist.artist_profile)
        for q in br.quotes:
            if q.artist and q.artist.artist_profile:
                setattr(q, "artist_profile", q.artist.artist_profile)
    return rows

def update_booking_request(
    db: Session, 
    db_booking_request: models.BookingRequest,
    request_update: schemas.BookingRequestUpdateByClient | schemas.BookingRequestUpdateByArtist
) -> models.BookingRequest:
    update_data = request_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_booking_request, key, value)
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
            joinedload(models.BookingRequest.artist).joinedload(models.User.artist_profile),
            joinedload(models.BookingRequest.service).joinedload(models.Service.artist),
            joinedload(models.BookingRequest.quotes)
            .joinedload(models.Quote.artist)
            .joinedload(models.User.artist_profile),
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
        query.order_by(
            func.coalesce(
                latest_msg.c.last_message_timestamp,
                models.BookingRequest.created_at,
            ).desc()
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    results: List[models.BookingRequest] = []
    def _state_from_status(status: "models.BookingStatus") -> str:
        if status in [models.BookingStatus.DRAFT, models.BookingStatus.PENDING_QUOTE, models.BookingStatus.PENDING]:
            return "requested"
        if status in [models.BookingStatus.QUOTE_PROVIDED]:
            return "quoted"
        if status in [models.BookingStatus.CONFIRMED, models.BookingStatus.REQUEST_CONFIRMED]:
            return "confirmed"
        if status in [models.BookingStatus.COMPLETED, models.BookingStatus.REQUEST_COMPLETED]:
            return "completed"
        if status in [
            models.BookingStatus.CANCELLED,
            models.BookingStatus.REQUEST_DECLINED,
            models.BookingStatus.REQUEST_WITHDRAWN,
            models.BookingStatus.QUOTE_REJECTED,
        ]:
            return "cancelled"
        return "requested"

    for br, content, timestamp in rows:
        # Compute preview via centralized helper for consistency
        last_m = crud_message.get_last_message_for_request(db, br.id)
        state = _state_from_status(br.status)
        # Prefer counterparty display name when QUOTE
        sender_display = None
        if last_m and last_m.sender_id:
            if last_m.sender_id == br.artist_id and br.artist:
                if br.artist.artist_profile and br.artist.artist_profile.business_name:
                    sender_display = br.artist.artist_profile.business_name
                else:
                    sender_display = f"{br.artist.first_name} {br.artist.last_name}"
            elif last_m.sender_id == br.client_id and br.client:
                sender_display = f"{br.client.first_name} {br.client.last_name}"
        preview = preview_label_for_message(last_m, thread_state=state, sender_display=sender_display)
        setattr(br, "last_message_content", preview)
        setattr(br, "last_message_timestamp", timestamp)
        if br.artist and br.artist.artist_profile:
            setattr(br, "artist_profile", br.artist.artist_profile)
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
        for q in br.quotes:
            if q.artist and q.artist.artist_profile:
                setattr(q, "artist_profile", q.artist.artist_profile)
        results.append(br)

    return results
