from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import User, UserType, BookingRequest, BookingStatus, MessageType
from app.models.base import BaseModel
from app.api import api_message
from app.schemas import MessageCreate


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_lowercase_message_type_normalized():
    db = setup_db()
    client = User(
        email="client@example.com",
        password="x",
        first_name="Client",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artist@example.com",
        password="x",
        first_name="Artist",
        last_name="User",
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
    db.refresh(br)

    msg_in = MessageCreate(content="hi", message_type="system")
    result = api_message.create_message(br.id, msg_in, db, current_user=client)

    assert result["message_type"] == MessageType.SYSTEM
