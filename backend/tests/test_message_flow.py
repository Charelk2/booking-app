import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingRequestStatus,
    MessageType,
    SenderType,
)
from app.models.base import BaseModel
from app.api import api_message
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
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.ARTIST)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    # Create booking request
    br = BookingRequest(client_id=client.id, artist_id=artist.id,
                        status=BookingRequestStatus.PENDING_QUOTE)
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(content='Who is the video for?', message_type=MessageType.SYSTEM)
    result = api_message.create_message(br.id, msg_in, db, current_user=client)

    assert result.sender_type == SenderType.ARTIST
    assert result.sender_id == artist.id
