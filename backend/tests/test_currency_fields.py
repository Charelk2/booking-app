from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, UserType, BookingRequest, BookingStatus
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.base import BaseModel
from app.models.service import ServiceType
from app.schemas import ServiceCreate, ServiceResponse
from app.api import api_service
from app.models.service_category import ServiceCategory


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_service_response_includes_currency():
    db = setup_db()
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.SERVICE_PROVIDER)
    db.add(artist)
    db.commit()
    db.refresh(artist)
    profile = ServiceProviderProfile(user_id=artist.id)
    db.add(profile)
    db.commit()

    category = ServiceCategory(name="DJ")
    db.add(category)
    db.commit()
    svc_in = ServiceCreate(
        title='Gig',
        duration_minutes=60,
        price=100,
        service_type=ServiceType.OTHER,
        media_url='x',
        service_category_id=category.id,
    )
    svc = api_service.create_service(db=db, service_in=svc_in, current_artist=artist)
    schema = ServiceResponse.model_validate(svc)
    assert schema.currency == 'ZAR'
