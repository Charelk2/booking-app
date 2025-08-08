import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.api import api_message
from app.crud import crud_message
from app.models.base import BaseModel

def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()

def test_read_messages_handles_missing_sender():
    db = setup_db()
    client = models.User(
        email='c@test.com',
        password='x',
        first_name='C',
        last_name='Client',
        user_type=models.UserType.CLIENT,
    )
    artist = models.User(
        email='a@test.com',
        password='x',
        first_name='A',
        last_name='Artist',
        user_type=models.UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit(); db.refresh(client); db.refresh(artist)

    br = models.BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=models.BookingStatus.PENDING_QUOTE,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(br); db.commit(); db.refresh(br)

    # Create message referencing a non-existent user to simulate missing sender
    crud_message.create_message(
        db,
        booking_request_id=br.id,
        sender_id=999,
        sender_type=models.SenderType.CLIENT,
        content='hello',
        message_type=models.MessageType.USER,
        visible_to=models.VisibleTo.BOTH,
    )

    messages = api_message.read_messages(br.id, db=db, current_user=client)
    assert len(messages) == 1
    assert messages[0]['content'] == 'hello'
    assert messages[0]['avatar_url'] is None
