from sqlalchemy.orm import Session, joinedload
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
