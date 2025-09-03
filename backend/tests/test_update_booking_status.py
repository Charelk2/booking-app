from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from app.models import User, UserType, Booking, BookingStatus, Service
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.base import BaseModel
from app.api.api_booking import update_booking_status
from app.schemas.booking import BookingUpdate


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_artist_can_update_booking_status():
    db = setup_db()
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
        status=BookingStatus.CONFIRMED,
        total_price=100,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    updated = update_booking_status(
        db=db,
        booking_id=booking.id,
        status_update=BookingUpdate(status=BookingStatus.COMPLETED),
        current_artist=artist,
    )
    assert updated.status == BookingStatus.COMPLETED
