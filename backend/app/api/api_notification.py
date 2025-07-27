from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
import enum
import logging
import re

from .. import models, schemas, crud
from .dependencies import get_db, get_current_user
from ..utils import error_response

router = APIRouter(tags=["notifications"])

logger = logging.getLogger(__name__)


def _build_response(
    db: Session, n: models.Notification
) -> schemas.NotificationResponse:
    data = schemas.NotificationResponse.model_validate(n).model_dump()
    sender = data.get("sender_name")
    btype = data.get("booking_type")
    avatar_url = data.get("avatar_url")
    if n.type == models.NotificationType.NEW_MESSAGE:
        try:
            match = re.match(r"New message from ([^:]+):", n.message)
            if match and not sender:
                sender = match.group(1).strip()

            br_match = re.search(r"/(?:booking-requests|messages/thread)/(\d+)", n.link)
            if br_match:
                br_id = int(br_match.group(1))
                br = (
                    db.query(models.BookingRequest)
                    .filter(models.BookingRequest.id == br_id)
                    .first()
                )
                if br:
                    other_id = (
                        br.client_id if br.artist_id == n.user_id else br.artist_id
                    )
                    other = (
                        db.query(models.User).filter(models.User.id == other_id).first()
                    )
                    if other:
                        if not sender:
                            sender = f"{other.first_name} {other.last_name}"
                        if other.user_type == models.UserType.ARTIST:
                            profile = (
                                db.query(models.ArtistProfile)
                                .filter(models.ArtistProfile.user_id == other.id)
                                .first()
                            )
                            if profile and profile.business_name and not match:
                                sender = profile.business_name
                            if profile and profile.profile_picture_url:
                                avatar_url = profile.profile_picture_url
                        elif other.profile_picture_url:
                            avatar_url = other.profile_picture_url
        except Exception as exc:  # pragma: no cover - defensive parsing
            logger.warning(
                "Failed to parse sender from message '%s': %s",
                n.message,
                exc,
            )
    elif n.type == models.NotificationType.NEW_BOOKING_REQUEST:
        try:
            request_id = int(n.link.split("/")[-1])
            br = (
                db.query(models.BookingRequest)
                .filter(models.BookingRequest.id == request_id)
                .first()
            )
            if br:
                client = (
                    db.query(models.User).filter(models.User.id == br.client_id).first()
                )
                if client:
                    sender = f"{client.first_name} {client.last_name}"
                    if client.profile_picture_url:
                        avatar_url = client.profile_picture_url
                if br.service_id:
                    service = (
                        db.query(models.Service)
                        .filter(models.Service.id == br.service_id)
                        .first()
                    )
                    if service:
                        btype = service.service_type
                        if isinstance(btype, enum.Enum):
                            btype = btype.value
        except (ValueError, IndexError) as exc:
            logger.warning(
                "Failed to derive booking request details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type in [
        models.NotificationType.DEPOSIT_DUE,
        models.NotificationType.NEW_BOOKING,
    ]:
        try:
            match = re.search(r"/bookings/(\d+)", n.link)
            if match:
                booking_id = int(match.group(1))
                booking = (
                    db.query(models.BookingSimple)
                    .filter(models.BookingSimple.id == booking_id)
                    .first()
                )
                if booking:
                    artist = (
                        db.query(models.User)
                        .filter(models.User.id == booking.artist_id)
                        .first()
                    )
                    if artist:
                        sender = f"{artist.first_name} {artist.last_name}"
                        profile = (
                            db.query(models.ArtistProfile)
                            .filter(models.ArtistProfile.user_id == artist.id)
                            .first()
                        )
                        if profile and profile.business_name:
                            sender = profile.business_name
                        if profile and profile.profile_picture_url:
                            avatar_url = profile.profile_picture_url
        except Exception as exc:  # pragma: no cover - defensive parsing
            logger.warning(
                "Failed to derive booking details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type == models.NotificationType.QUOTE_ACCEPTED:
        try:
            match = re.search(r"/booking-requests/(\d+)", n.link)
            if match:
                request_id = int(match.group(1))
                br = (
                    db.query(models.BookingRequest)
                    .filter(models.BookingRequest.id == request_id)
                    .first()
                )
                if br:
                    client = (
                        db.query(models.User)
                        .filter(models.User.id == br.client_id)
                        .first()
                    )
                    if client:
                        sender = f"{client.first_name} {client.last_name}"
                        if client.profile_picture_url:
                            avatar_url = client.profile_picture_url
        except (ValueError, IndexError) as exc:
            logger.warning(
                "Failed to derive quote accepted details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type == models.NotificationType.REVIEW_REQUEST:
        try:
            match = re.search(r"/bookings/(\d+)", n.link)
            if match:
                booking_id = int(match.group(1))
                booking = (
                    db.query(models.BookingSimple)
                    .filter(models.BookingSimple.id == booking_id)
                    .first()
                )
                if booking:
                    artist = (
                        db.query(models.User)
                        .filter(models.User.id == booking.artist_id)
                        .first()
                    )
                    if artist:
                        sender = f"{artist.first_name} {artist.last_name}"
                        profile = (
                            db.query(models.ArtistProfile)
                            .filter(models.ArtistProfile.user_id == artist.id)
                            .first()
                        )
                        if profile and profile.business_name:
                            sender = profile.business_name
                        if profile and profile.profile_picture_url:
                            avatar_url = profile.profile_picture_url
        except Exception as exc:  # pragma: no cover - defensive parsing
            logger.warning(
                "Failed to derive review request details from link %s: %s",
                n.link,
                exc,
            )
    elif n.type == models.NotificationType.BOOKING_STATUS_UPDATED:
        try:
            request_id = int(n.link.split("/")[-1])
            br = (
                db.query(models.BookingRequest)
                .filter(models.BookingRequest.id == request_id)
                .first()
            )
            if br:
                client = (
                    db.query(models.User).filter(models.User.id == br.client_id).first()
                )
                artist = (
                    db.query(models.User).filter(models.User.id == br.artist_id).first()
                )
                if client:
                    sender = f"{client.first_name} {client.last_name}"
                profile = (
                    db.query(models.ArtistProfile)
                    .filter(models.ArtistProfile.user_id == br.artist_id)
                    .first()
                )
                # Show the avatar of the opposite party
                if n.user_id == br.artist_id and client and client.profile_picture_url:
                    avatar_url = client.profile_picture_url
                elif (
                    n.user_id == br.client_id
                    and profile
                    and profile.profile_picture_url
                ):
                    avatar_url = profile.profile_picture_url
        except (ValueError, IndexError) as exc:
            logger.warning(
                "Failed to derive booking status update details from link %s: %s",
                n.link,
                exc,
            )
    data["sender_name"] = sender
    data["booking_type"] = btype
    data["avatar_url"] = avatar_url
    return schemas.NotificationResponse(**data)


@router.get("/notifications", response_model=List[schemas.NotificationResponse])
def read_my_notifications(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Retrieve notifications for the current user with pagination."""
    notifs = crud.crud_notification.get_notifications_for_user(
        db, current_user.id, skip=skip, limit=limit
    )
    return [_build_response(db, n) for n in notifs]


@router.put(
    "/notifications/{notification_id}/read",
    response_model=schemas.NotificationResponse,
)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark a notification as read."""
    db_notif = crud.crud_notification.get_notification(db, notification_id)
    if not db_notif or db_notif.user_id != current_user.id:
        raise error_response(
            "Notification not found",
            {"notification_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    updated = crud.crud_notification.mark_as_read(db, db_notif)
    return _build_response(db, updated)


@router.get(
    "/notifications/message-threads",
    response_model=List[schemas.ThreadNotificationResponse],
)
def read_message_threads(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Retrieve unread message notifications grouped by chat thread."""
    return crud.crud_notification.get_message_thread_notifications(db, current_user.id)


@router.put("/notifications/message-threads/{booking_request_id}/read")
def mark_thread_read(
    booking_request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark all message notifications for the thread as read."""
    crud.crud_notification.mark_thread_read(db, current_user.id, booking_request_id)
    return {"booking_request_id": booking_request_id}


@router.put("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark all notifications as read for the current user."""
    updated = crud.crud_notification.mark_all_read(db, current_user.id)
    return {"updated": updated}
