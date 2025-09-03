import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingStatus,
    SenderType,
    MessageType,
)
from app.models.base import BaseModel
from app.api import api_booking_request
from app.crud import crud_message


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_read_my_client_booking_requests_last_message_ordering():
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
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br1 = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    br2 = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add_all([br1, br2])
    db.commit()
    db.refresh(br1)
    db.refresh(br2)

    earlier = datetime.datetime(2024, 1, 1, 12, 0, 0)
    later = datetime.datetime(2024, 1, 2, 12, 0, 0)
    later2 = datetime.datetime(2024, 1, 3, 12, 0, 0)

    m1 = crud_message.create_message(
        db,
        br1.id,
        client.id,
        SenderType.CLIENT,
        "hi",
        MessageType.USER,
    )
    m1.timestamp = earlier
    db.add(m1)
    m2 = crud_message.create_message(
        db,
        br1.id,
        artist.id,
        SenderType.ARTIST,
        "reply",
        MessageType.USER,
    )
    m2.timestamp = later
    db.add(m2)
    m3 = crud_message.create_message(
        db,
        br2.id,
        client.id,
        SenderType.CLIENT,
        "ping",
        MessageType.USER,
    )
    m3.timestamp = later2
    db.add(m3)
    db.commit()

    requests = api_booking_request.read_my_client_booking_requests(
        db=db,
        current_user=client,
    )

    assert len(requests) == 2
    assert requests[0].id == br2.id
    assert requests[0].last_message_content == 'ping'
    assert requests[0].last_message_timestamp == later2
    assert requests[1].id == br1.id
    assert requests[1].last_message_content == 'reply'
    assert requests[1].last_message_timestamp == later
