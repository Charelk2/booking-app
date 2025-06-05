import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingRequestStatus,
    MessageType,
)
from app.models.base import BaseModel
from app.api import api_message, api_booking_request
from app.schemas import MessageCreate, BookingRequestCreate
from app.crud import crud_notification


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_message_creates_notification():
    db = setup_db()
    client = User(email='c@test.com', password='x', first_name='C', last_name='User', user_type=UserType.CLIENT)
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.ARTIST)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(client_id=client.id, artist_id=artist.id, status=BookingRequestStatus.PENDING_QUOTE)
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(content='hello', message_type=MessageType.TEXT)
    api_message.create_message(br.id, msg_in, db, current_user=client)

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert len(notifs) == 1
    assert notifs[0].type.value == 'new_message'


def test_booking_request_creates_notification():
    db = setup_db()
    client = User(email='c@test.com', password='x', first_name='C', last_name='User', user_type=UserType.CLIENT)
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.ARTIST)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    req_in = BookingRequestCreate(artist_id=artist.id, message='hi', status=BookingRequestStatus.PENDING_QUOTE)
    api_booking_request.create_booking_request(req_in, db, current_user=client)

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert len(notifs) == 1
    assert notifs[0].type.value == 'new_booking_request'
