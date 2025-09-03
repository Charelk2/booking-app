import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import User, UserType, Service, BookingStatus
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.service import ServiceType
from app.models.base import BaseModel
from app.api import api_booking_request
from app.schemas import BookingRequestCreate, BookingRequestUpdateByClient


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_client_can_update_service_id():
    db = setup_db()
    client = User(email='c@test.com', password='x', first_name='C', last_name='Client', user_type=UserType.CLIENT)
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.SERVICE_PROVIDER)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    profile = ServiceProviderProfile(user_id=artist.id)
    svc1 = Service(
        artist_id=artist.id,
        title='One',
        price=10,
        duration_minutes=30,
        service_type=ServiceType.OTHER,
        media_url='x',
    )
    svc2 = Service(
        artist_id=artist.id,
        title='Two',
        price=20,
        duration_minutes=45,
        service_type=ServiceType.OTHER,
        media_url='y',
    )
    profile.services.extend([svc1, svc2])
    db.add(profile)
    db.commit()
    db.refresh(svc1)
    db.refresh(svc2)

    req_in = BookingRequestCreate(artist_id=artist.id, service_id=svc1.id, status=BookingStatus.PENDING_QUOTE)
    br = api_booking_request.create_booking_request(req_in, db, current_user=client)

    update = BookingRequestUpdateByClient(service_id=svc2.id)
    updated = api_booking_request.update_booking_request_by_client(br.id, update, db, current_user=client)
    assert updated.service_id == svc2.id
