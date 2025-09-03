import json
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import User, UserType, BookingStatus
from app.models.base import BaseModel
from app.api import api_booking_request
from app.schemas import BookingRequestCreate


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_create_request_with_travel():
    db = setup_db()
    client = User(email='c@test.com', password='x', first_name='C', last_name='Client', user_type=UserType.CLIENT)
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.SERVICE_PROVIDER)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    req_in = BookingRequestCreate(
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
        travel_mode='fly',
        travel_cost=Decimal('123.45'),
        travel_breakdown={'mode': 'fly'}
    )

    br = api_booking_request.create_booking_request(req_in, db, current_user=client)

    assert br.travel_mode == 'fly'
    assert br.travel_cost == Decimal('123.45')
    assert br.travel_breakdown == {'mode': 'fly'}
