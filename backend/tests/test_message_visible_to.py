import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.api import api_message
from app.crud import crud_message
from app.models.base import BaseModel


def setup_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_read_messages_filters_by_visible_to():
    db = setup_db()
    client = models.User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="Client",
        user_type=models.UserType.CLIENT,
    )
    artist = models.User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=models.UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = models.BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=models.BookingStatus.PENDING_QUOTE,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    crud_message.create_message(
        db,
        booking_request_id=br.id,
        sender_id=client.id,
        sender_type=models.SenderType.CLIENT,
        content="hi",
        message_type=models.MessageType.USER,
        visible_to=models.VisibleTo.BOTH,
    )
    crud_message.create_message(
        db,
        booking_request_id=br.id,
        sender_id=artist.id,
        sender_type=models.SenderType.ARTIST,
        content="secret",
        message_type=models.MessageType.USER,
        visible_to=models.VisibleTo.ARTIST,
    )
    crud_message.create_message(
        db,
        booking_request_id=br.id,
        sender_id=client.id,
        sender_type=models.SenderType.CLIENT,
        content="note",
        message_type=models.MessageType.USER,
        visible_to=models.VisibleTo.CLIENT,
    )

    client_msgs = api_message.read_messages(br.id, db=db, current_user=client)
    assert len(client_msgs.items) == 2
    assert {m.content for m in client_msgs.items} == {"hi", "note"}

    artist_msgs = api_message.read_messages(br.id, db=db, current_user=artist)
    assert len(artist_msgs.items) == 2
    assert {m.content for m in artist_msgs.items} == {"hi", "secret"}
