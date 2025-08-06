from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import User, UserType, MessageType, VisibleTo, MessageAction
from app.models.base import BaseModel
from app.api import api_booking_request
from app.crud import crud_message
from app.schemas import BookingRequestCreate


def setup_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_request_creates_artist_prompt():
    db = setup_db()
    client = User(
        email="client@test.com",
        password="x",
        first_name="C",
        last_name="L",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artist@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.ARTIST,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    req_in = BookingRequestCreate(
        artist_id=artist.id,
        message="hi",
        status=None,
        proposed_datetime_1=datetime(2030, 1, 1, 20, 0, 0),
    )
    br = api_booking_request.create_booking_request(req_in, db, current_user=client)

    msgs = crud_message.get_messages_for_request(db, br.id)
    assert len(msgs) == 1
    msg = msgs[0]
    assert msg.message_type == MessageType.SYSTEM
    assert msg.visible_to == VisibleTo.ARTIST
    assert msg.action == MessageAction.REVIEW_QUOTE
