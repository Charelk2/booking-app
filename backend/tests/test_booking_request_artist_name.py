from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import api_booking_request
from app.models.base import BaseModel
from app.models.user import User, UserType
from app.models.artist_profile_v2 import ArtistProfileV2
from app.models.request_quote import BookingRequest, BookingRequestStatus


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_client_booking_request_includes_artist_business_name():
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
        user_type=UserType.ARTIST,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    profile = ArtistProfileV2(user_id=artist.id, business_name="The Band")
    db.add(profile)
    db.commit()

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingRequestStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()

    requests = api_booking_request.read_my_client_booking_requests(db=db, current_user=client)
    assert len(requests) == 1
    assert requests[0].artist_profile.business_name == "The Band"
