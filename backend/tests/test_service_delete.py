import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.models import (
    User,
    UserType,
    Service,
    BookingRequest,
    BookingStatus,
    Message,
    MessageType,
    SenderType,
)
from app.models.service import ServiceType
from app.models.artist_profile_v2 import ArtistProfileV2
from app.models.base import BaseModel


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_delete_service_cascades_messages():
    db = setup_db()
    # Create artist and client
    artist_user = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.SERVICE_PROVIDER)
    client_user = User(email='c@test.com', password='x', first_name='C', last_name='Client', user_type=UserType.CLIENT)
    db.add_all([artist_user, client_user])
    db.commit()
    db.refresh(artist_user)
    db.refresh(client_user)

    # Artist profile and service
    profile = ArtistProfileV2(user_id=artist_user.id)
    service = Service(
        artist_id=artist_user.id,
        title='Gig',
        price=100,
        duration_minutes=60,
        service_type=ServiceType.OTHER,
        media_url='x',
    )
    profile.services.append(service)
    db.add(profile)
    db.commit()
    db.refresh(service)

    # Booking request with message
    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist_user.id,
        service_id=service.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    msg = Message(
        booking_request_id=br.id,
        sender_id=client_user.id,
        sender_type=SenderType.CLIENT,
        content='hi',
        message_type=MessageType.USER,
    )
    db.add(msg)
    db.commit()

    assert db.query(Message).count() == 1
    db.delete(service)
    db.commit()

    assert db.query(BookingRequest).count() == 0
    assert db.query(Message).count() == 0
