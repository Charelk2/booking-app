import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingStatus,
    MessageType,
    SenderType,
)
from app.models.base import BaseModel
from app.api import api_message
from app.crud import crud_message
from app.schemas import MessageCreate


def setup_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_delete_message_creates_tombstone_instead_of_hard_delete():
    db = setup_db()
    # Users
    client = User(
        email="del@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="delartist@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    # Booking request
    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    # Create a normal user message from client
    msg_in = MessageCreate(content="to be deleted", message_type=MessageType.USER)
    result = api_message.create_message(br.id, msg_in, db, current_user=client)
    msg_id = int(result["id"])

    # Ensure it exists in the DB
    msgs = crud_message.get_messages_for_request(db, br.id)
    assert any(m.id == msg_id for m in msgs)

    # Delete the message as the sender
    api_message.delete_message(
        request_id=br.id,
        message_id=msg_id,
        db=db,
        current_user=client,
    )

    # Message row should still exist but as a tombstone
    msgs_after = crud_message.get_messages_for_request(db, br.id)
    assert len(msgs_after) == 1
    tomb = msgs_after[0]
    assert tomb.id == msg_id
    assert tomb.message_type == MessageType.SYSTEM
    assert (tomb.system_key or "").startswith("message_deleted")
    assert "deleted" in (tomb.content or "").lower()
    # Basic payload fields cleared
    assert tomb.attachment_url is None
    assert tomb.attachment_meta is None
    assert tomb.quote_id is None
