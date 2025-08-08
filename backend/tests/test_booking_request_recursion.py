import decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingStatus,
    Quote,
)
from app.models.base import BaseModel
from app.api import api_booking_request
from app.schemas import BookingRequestResponse


def setup_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_artist_booking_requests_no_recursion():
    db = setup_db()
    artist = User(email="a@test.com", password="x", first_name="A", last_name="R", user_type=UserType.SERVICE_PROVIDER)
    client = User(email="c@test.com", password="x", first_name="C", last_name="L", user_type=UserType.CLIENT)
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    br = BookingRequest(client_id=client.id, artist_id=artist.id, status=BookingStatus.PENDING_QUOTE)
    db.add(br)
    db.commit()
    db.refresh(br)

    quote = Quote(
        booking_request_id=br.id,
        artist_id=artist.id,
        quote_details="details",
        price=decimal.Decimal("10.00"),
        currency="ZAR",
    )
    br.quotes.append(quote)
    db.add(quote)
    db.commit()
    db.refresh(br)
    db.refresh(quote)

    result = api_booking_request.read_my_artist_booking_requests(db=db, current_artist=artist)
    assert result
    # Should serialize without recursion errors
    model = BookingRequestResponse.model_validate(result[0])
    dumped = model.model_dump()
    if dumped["quotes"]:
        assert "booking_request" not in dumped["quotes"][0]
