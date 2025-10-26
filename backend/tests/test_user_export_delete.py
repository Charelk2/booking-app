from datetime import datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import BaseModel
from app.models import (
    User,
    UserType,
    Service,
    Booking,
    BookingStatus,
    BookingRequest,
    QuoteV2,
    QuoteStatusV2,
    BookingSimple,
    Message,
    SenderType,
    MessageType,
)
from app.api.dependencies import get_db
from app.api.auth import get_password_hash, create_access_token
import app.api.api_user as api_user


def setup_app():
    engine = create_engine(
        'sqlite:///:memory:',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    return Session


def create_data(Session):
    db = Session()
    client = User(
        email='client@test.com',
        password=get_password_hash('pw'),
        first_name='C',
        last_name='L',
        user_type=UserType.CLIENT,
    )
    artist = User(
        email='artist@test.com',
        password='x',
        first_name='A',
        last_name='R',
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    service = Service(
        artist_id=artist.id,
        title='Gig',
        price=Decimal('100'),
        duration_minutes=60,
        service_type='Live Performance',
        media_url='x',
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    br = BookingRequest(client_id=client.id, artist_id=artist.id)
    db.add(br)
    db.commit()
    db.refresh(br)

    quote = QuoteV2(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[],
        sound_fee=0,
        travel_fee=0,
        subtotal=Decimal('100'),
        total=Decimal('100'),
        status=QuoteStatusV2.ACCEPTED,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    booking = Booking(
        artist_id=artist.id,
        client_id=client.id,
        service_id=service.id,
        start_time=datetime(2030, 1, 1, 12, 0, 0),
        end_time=datetime(2030, 1, 1, 13, 0, 0),
        status=BookingStatus.CONFIRMED,
        total_price=Decimal('100'),
        quote_id=quote.id,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    simple = BookingSimple(
        quote_id=quote.id,
        artist_id=artist.id,
        client_id=client.id,
        confirmed=True,
        payment_status='paid',
        charged_total_amount=Decimal('100'),
    )
    db.add(simple)
    db.commit()

    msg = Message(
        booking_request_id=br.id,
        sender_id=client.id,
        sender_type=SenderType.CLIENT,
        message_type=MessageType.USER,
        content='Hello',
    )
    db.add(msg)
    db.commit()
    db.close()
    return client


def test_export_me_returns_data(monkeypatch):
    Session = setup_app()
    user = create_data(Session)

    token = create_access_token({'sub': user.email})
    client = TestClient(app)

    resp = client.get('/api/v1/users/me/export', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 200
    data = resp.json()
    assert data['user']['email'] == 'client@test.com'
    assert len(data['bookings']) == 1
    assert len(data['payments']) == 1
    assert len(data['messages']) == 1


def test_delete_me_requires_password_and_sends_email(monkeypatch):
    Session = setup_app()
    user = create_data(Session)
    called = {}

    def fake_send(to, subject, body):
        called['email'] = to

    monkeypatch.setattr(api_user, 'send_email', fake_send)

    token = create_access_token({'sub': user.email})
    client = TestClient(app)

    resp = client.request(
        'DELETE',
        '/api/v1/users/me',
        headers={'Authorization': f'Bearer {token}'},
        json={'password': 'pw'},
    )
    assert resp.status_code == 204

    db = Session()
    assert db.query(User).filter(User.id == user.id).first() is None
    assert called['email'] == 'client@test.com'
    db.close()
