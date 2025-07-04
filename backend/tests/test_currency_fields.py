from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, UserType, BookingRequest, BookingRequestStatus
from app.models.artist_profile_v2 import ArtistProfileV2
from app.models.base import BaseModel
from app.models.service import ServiceType
from app.schemas import ServiceCreate, ServiceResponse
from app.api import api_service


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_service_response_includes_currency():
    db = setup_db()
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.ARTIST)
    db.add(artist)
    db.commit()
    db.refresh(artist)
    profile = ArtistProfileV2(user_id=artist.id)
    db.add(profile)
    db.commit()

    svc_in = ServiceCreate(title='Gig', duration_minutes=60, price=100, service_type=ServiceType.OTHER)
    svc = api_service.create_service(db=db, service_in=svc_in, current_artist=artist)
    schema = ServiceResponse.model_validate(svc)
    assert schema.currency == 'ZAR'
