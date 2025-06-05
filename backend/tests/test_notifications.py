import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingRequestStatus,
    MessageType,
    NotificationType,
)
from app import models
from app.models.base import BaseModel
from app.api import api_message, api_booking_request
from app.schemas import MessageCreate, BookingRequestCreate
from app.crud import crud_notification


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_message_creates_notification():
    db = setup_db()
    client = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.ARTIST,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingRequestStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(content="hello", message_type=MessageType.TEXT)
    api_message.create_message(br.id, msg_in, db, current_user=client)

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert len(notifs) == 1
    assert notifs[0].type.value == "new_message"
    assert notifs[0].link == f"/booking-requests/{br.id}"


def test_booking_request_creates_notification():
    db = setup_db()
    client = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.ARTIST,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    req_in = BookingRequestCreate(
        artist_id=artist.id, message="hi", status=BookingRequestStatus.PENDING_QUOTE
    )
    api_booking_request.create_booking_request(req_in, db, current_user=client)

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert len(notifs) == 1
    assert notifs[0].type.value == "new_booking_request"
    assert notifs[0].link.startswith("/booking-requests/")


def test_get_notifications_pagination_and_grouping():
    db = setup_db()
    user = User(
        email="u@test.com",
        password="x",
        first_name="T",
        last_name="User",
        user_type=UserType.ARTIST,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # create 5 notifications, alternating types
    for i in range(5):
        crud_notification.create_notification(
            db,
            user_id=user.id,
            type=(
                NotificationType.NEW_MESSAGE
                if i % 2 == 0
                else NotificationType.NEW_BOOKING_REQUEST
            ),
            message=f"msg {i}",
            link=f"/x/{i}",
        )

    # pagination
    first_two = crud_notification.get_notifications_for_user(db, user.id, limit=2)
    assert len(first_two) == 2
    second_two = crud_notification.get_notifications_for_user(
        db, user.id, skip=2, limit=2
    )
    assert len(second_two) == 2
    assert first_two[0].id != second_two[0].id

    # grouping
    grouped = crud_notification.get_notifications_grouped_by_type(db, user.id)
    assert set(grouped.keys()) == {"new_message", "new_booking_request"}
    total = sum(len(v) for v in grouped.values())
    assert total == 5


def test_thread_notification_summary():
    db = setup_db()
    client = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.ARTIST,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingRequestStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    # send multiple messages from client -> artist
    for _ in range(5):
        msg_in = MessageCreate(content="hi", message_type=MessageType.TEXT)
        api_message.create_message(br.id, msg_in, db, current_user=client)

    threads = crud_notification.get_message_thread_notifications(db, artist.id)
    assert len(threads) == 1
    t = threads[0]
    assert t["booking_request_id"] == br.id
    assert t["unread_count"] == 5
    assert t["name"] == "C User"

    # mark thread read
    crud_notification.mark_thread_read(db, artist.id, br.id)
    threads_after = crud_notification.get_message_thread_notifications(db, artist.id)
    assert len(threads_after) == 1
    assert threads_after[0]["unread_count"] == 0


def test_thread_notification_uses_business_name_for_artist():
    db = setup_db()
    client = User(
        email="c2@test.com",
        password="x",
        first_name="C2",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a2@test.com",
        password="x",
        first_name="A2",
        last_name="Artist",
        user_type=UserType.ARTIST,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    profile = models.ArtistProfile(user_id=artist.id, business_name="The Band")
    db.add(profile)
    db.commit()
    db.refresh(profile)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingRequestStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(content="hello", message_type=MessageType.TEXT)
    api_message.create_message(br.id, msg_in, db, current_user=artist)

    threads = crud_notification.get_message_thread_notifications(db, client.id)
    assert len(threads) == 1
    assert threads[0]["name"] == "The Band"
