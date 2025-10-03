import pytest
import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingStatus,
    MessageType,
    SenderType,
    ServiceProviderProfile,
)
from app.models.base import BaseModel
from app.api import api_message
from app.crud import crud_message
from app.schemas import MessageCreate


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_system_message_from_client_marked_as_artist():
    db = setup_db()
    # Create client and artist users
    client = User(email='c@test.com', password='x', first_name='C', last_name='User', user_type=UserType.CLIENT)
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.SERVICE_PROVIDER)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    # Create booking request
    br = BookingRequest(client_id=client.id, artist_id=artist.id,
                        status=BookingStatus.PENDING_QUOTE)
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(content='Who is the video for?', message_type=MessageType.SYSTEM)
    result = api_message.create_message(br.id, msg_in, db, current_user=client)

    assert result["sender_type"] == SenderType.ARTIST
    assert result["sender_id"] == artist.id
    assert result.get("avatar_url") is None


def test_message_response_includes_avatar_url_for_artist():
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
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    profile = ServiceProviderProfile(
        user_id=artist.id, profile_picture_url="/static/profile_pics/pic.jpg"
    )
    db.add(profile)
    db.commit()

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()

    msg_in = MessageCreate(content="hello", message_type=MessageType.USER)
    result = api_message.create_message(br.id, msg_in, db, current_user=artist)

    assert result["avatar_url"] == "/static/profile_pics/pic.jpg"


def test_message_response_includes_avatar_url_for_client():
    db = setup_db()
    client = User(
        email="clientpic@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
        profile_picture_url="/static/profile_pics/client.jpg",
    )
    artist = User(
        email="artistpic@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()

    msg_in = MessageCreate(content="hi", message_type=MessageType.USER)
    result = api_message.create_message(br.id, msg_in, db, current_user=client)

    assert result["avatar_url"] == "/static/profile_pics/client.jpg"


def test_mark_messages_read_updates_flag():
    db = setup_db()
    client = User(
        email="r@test.com",
        password="x",
        first_name="Reader",
        last_name="Client",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="writer@test.com",
        password="x",
        first_name="Writer",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()

    msg_in = MessageCreate(content="hello", message_type=MessageType.USER)
    api_message.create_message(br.id, msg_in, db, current_user=artist)

    # Ensure message unread initially
    msgs = crud_message.get_messages_for_request(db, br.id)
    assert msgs[0].is_read is False

    asyncio.run(api_message.mark_messages_read(br.id, db=db, current_user=client))

    msgs = crud_message.get_messages_for_request(db, br.id)
    assert msgs[0].is_read is True


def test_read_messages_negative_after_id_gracefully_ignored():
    db = setup_db()
    client = User(
        email="neg@test.com",
        password="x",
        first_name="Neg",
        last_name="Client",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="negartist@test.com",
        password="x",
        first_name="Neg",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()

    msg_in = MessageCreate(content="hello", message_type=MessageType.USER)
    api_message.create_message(br.id, msg_in, db, current_user=artist)

    response = api_message.read_messages(br.id, db=db, current_user=client, after_id=-5)
    assert isinstance(response.items, list)
    assert len(response.items) == 1



def test_read_messages_pagination_and_fields():
    db = setup_db()
    client = User(
        email="page@test.com",
        password="x",
        first_name="P",
        last_name="Client",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artistpage@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()

    # Create three messages
    for i in range(3):
        msg_in = MessageCreate(content=f"m{i}", message_type=MessageType.USER)
        api_message.create_message(br.id, msg_in, db, current_user=client)

    envelope = api_message.read_messages(
        br.id, db=db, current_user=client, skip=1, limit=1, fields="content"
    )
    assert len(envelope.items) == 1
    msg = envelope.items[0]
    assert msg.content == "m1"
    assert msg.quote_id is None
    assert envelope.mode == "full"
