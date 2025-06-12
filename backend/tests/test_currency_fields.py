from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, UserType, BookingRequest, BookingRequestStatus
from app.models.artist_profile_v2 import ArtistProfileV2
from app.models.base import BaseModel
from app.models.service import ServiceType
from app.schemas import ServiceCreate, ServiceResponse, QuoteCreate, QuoteResponse
from app.api import api_service
from app.crud import crud_quote


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


def test_quote_response_includes_currency():
    db = setup_db()
    client = User(email='c@test.com', password='x', first_name='C', last_name='Client', user_type=UserType.CLIENT)
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.ARTIST)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)
    profile = ArtistProfileV2(user_id=artist.id)
    db.add(profile)
    db.commit()

    br = BookingRequest(client_id=client.id, artist_id=artist.id, status=BookingRequestStatus.PENDING_QUOTE)
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(booking_request_id=br.id, quote_details='Hi', price=50)
    quote = crud_quote.create_quote(db=db, quote=quote_in, artist_id=artist.id)
    schema = QuoteResponse.model_validate(quote)
    assert schema.currency == 'ZAR'

