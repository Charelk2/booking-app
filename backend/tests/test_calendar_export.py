from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from ics import Calendar
from app.models import User, UserType, Booking, BookingStatus, Service
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.base import BaseModel
from app.api.api_booking import download_booking_calendar


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_calendar_download_returns_ics():
    db = setup_db()
    client_user = User(email='c@test.com', password='x', first_name='C', last_name='User', user_type=UserType.CLIENT)
    artist_user = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.SERVICE_PROVIDER)
    db.add_all([client_user, artist_user])
    db.commit()
    db.refresh(client_user)
    db.refresh(artist_user)

    profile = ServiceProviderProfile(user_id=artist_user.id)
    service = Service(
        artist_id=artist_user.id,
        title='Gig',
        price=100,
        duration_minutes=60,
        media_url='x',
    )
    db.add_all([profile, service])
    db.commit()
    db.refresh(service)

    booking = Booking(
        artist_id=artist_user.id,
        client_id=client_user.id,
        service_id=service.id,
        start_time=datetime.fromisoformat('2025-01-01T12:00:00'),
        end_time=datetime.fromisoformat('2025-01-01T13:00:00'),
        status=BookingStatus.CONFIRMED,
        total_price=100,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    response = download_booking_calendar(db=db, booking_id=booking.id, current_user=client_user)
    assert response.media_type == 'text/calendar'
    cal = Calendar(response.body.decode())
    event = next(iter(cal.events))
    assert event.name == 'Gig'
    assert event.begin.datetime == datetime.fromisoformat('2025-01-01T12:00:00+00:00')
    assert event.end.datetime == datetime.fromisoformat('2025-01-01T13:00:00+00:00')

