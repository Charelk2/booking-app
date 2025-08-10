from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import datetime

from app.models import (
    User,
    UserType,
    ServiceProviderProfile,
    BookingRequest,
    BookingStatus,
    Message,
    SenderType,
    MessageType,
    ArtistProfileView,
)
from app.models.base import BaseModel
from app.api import api_booking_request
from app.api.dependencies import get_db


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_get_dashboard_stats():
    db = setup_db()
    artist = User(email="a@test.com", password="x", first_name="A", last_name="Artist", user_type=UserType.SERVICE_PROVIDER)
    client = User(email="c@test.com", password="x", first_name="C", last_name="Client", user_type=UserType.CLIENT)
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    profile = ServiceProviderProfile(user_id=artist.id)
    db.add(profile)
    db.commit()

    now = datetime.utcnow()
    req1 = BookingRequest(client_id=client.id, artist_id=artist.id, status=BookingStatus.PENDING_QUOTE, created_at=now)
    req2 = BookingRequest(client_id=client.id, artist_id=artist.id, status=BookingStatus.QUOTE_PROVIDED, created_at=now)
    db.add_all([req1, req2])
    db.commit()
    db.refresh(req2)

    msg = Message(
        booking_request_id=req2.id,
        sender_id=artist.id,
        sender_type=SenderType.ARTIST,
        message_type=MessageType.USER,
        content="hello",
    )
    db.add(msg)
    db.add_all([ArtistProfileView(artist_id=artist.id) for _ in range(3)])
    db.commit()

    stats = api_booking_request.get_dashboard_stats(db=db, current_user=artist)

    assert stats["monthly_new_inquiries"] == 2
    assert stats["profile_views"] == 3
    assert stats["response_rate"] == 50.0

