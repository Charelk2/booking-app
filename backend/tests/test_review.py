import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from fastapi import HTTPException
from app.models import User, UserType, Service, Booking, BookingStatus
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.base import BaseModel
from app.api import api_review
from app.schemas.review import ReviewCreate


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def create_booking(db, status=BookingStatus.COMPLETED):
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.SERVICE_PROVIDER)
    client = User(email='c@test.com', password='x', first_name='C', last_name='User', user_type=UserType.CLIENT)
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    profile = ServiceProviderProfile(user_id=artist.id)
    service = Service(
        artist_id=artist.id,
        title='Gig',
        price=100,
        duration_minutes=60,
        service_type='Live Performance',
        media_url='x',
    )
    db.add_all([profile, service])
    db.commit()
    db.refresh(service)

    booking = Booking(
        artist_id=artist.id,
        client_id=client.id,
        service_id=service.id,
        start_time=datetime(2030, 1, 1, 12, 0),
        end_time=datetime(2030, 1, 1, 13, 0),
        status=status,
        total_price=100,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking, client, service


def test_create_review_success():
    db = setup_db()
    booking, client, service = create_booking(db)

    review_in = ReviewCreate(rating=5, comment='Great show')
    review = api_review.create_review_for_booking(db=db, booking_id=booking.id, review_in=review_in, current_client=client)

    assert review.booking_id == booking.id
    assert review.service_id == service.id
    assert review.artist_id == booking.artist_id
    assert review.rating == 5
    assert review.comment == 'Great show'


def test_create_review_requires_completed_booking():
    db = setup_db()
    booking, client, _ = create_booking(db, status=BookingStatus.CONFIRMED)

    review_in = ReviewCreate(rating=4, comment='Nice')
    with pytest.raises(HTTPException) as exc_info:
        api_review.create_review_for_booking(db=db, booking_id=booking.id, review_in=review_in, current_client=client)

    assert exc_info.value.status_code == 400


