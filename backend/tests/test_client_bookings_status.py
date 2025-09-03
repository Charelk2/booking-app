from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import datetime
from decimal import Decimal

from app.main import app
from app.models.base import BaseModel
from app.models import User, UserType, Service, Booking, BookingStatus
from app.api.dependencies import get_db, get_current_active_client


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
        password='x',
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
        price=100,
        duration_minutes=60,
        service_type='Live Performance',
        media_url='x',
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    upcoming = Booking(
        artist_id=artist.id,
        client_id=client.id,
        service_id=service.id,
        start_time=datetime(2030, 1, 1, 12, 0, 0),
        end_time=datetime(2030, 1, 1, 13, 0, 0),
        status=BookingStatus.CONFIRMED,
        total_price=100,
    )
    past = Booking(
        artist_id=artist.id,
        client_id=client.id,
        service_id=service.id,
        start_time=datetime(2020, 1, 1, 12, 0, 0),
        end_time=datetime(2020, 1, 1, 13, 0, 0),
        status=BookingStatus.COMPLETED,
        total_price=100,
    )
    db.add_all([upcoming, past])
    db.commit()
    db.close()
    return client


def test_filter_upcoming_and_past():
    Session = setup_app()
    client_user = create_data(Session)

    def override_client():
        return client_user

    app.dependency_overrides[get_current_active_client] = override_client
    api_client = TestClient(app)

    res_upcoming = api_client.get('/api/v1/bookings/my-bookings?status=upcoming')
    assert res_upcoming.status_code == 200
    data_upcoming = res_upcoming.json()
    assert len(data_upcoming) == 1
    assert data_upcoming[0]['status'] == 'confirmed'
    assert data_upcoming[0]['deposit_due_by'] is None
    assert Decimal(data_upcoming[0]['deposit_amount']) == Decimal('0')
    assert data_upcoming[0]['payment_status'] is None
    assert data_upcoming[0]['deposit_paid'] is None

    res_past = api_client.get('/api/v1/bookings/my-bookings?status=past')
    assert res_past.status_code == 200
    data_past = res_past.json()
    assert len(data_past) == 1
    assert data_past[0]['status'] == 'completed'
    assert data_past[0]['deposit_due_by'] is None
    assert Decimal(data_past[0]['deposit_amount']) == Decimal('0')
    assert data_past[0]['payment_status'] is None
    assert data_past[0]['deposit_paid'] is None

    app.dependency_overrides.clear()


def test_invalid_status_returns_422(caplog):
    Session = setup_app()
    client_user = create_data(Session)

    def override_client():
        return client_user

    app.dependency_overrides[get_current_active_client] = override_client
    api_client = TestClient(app)

    caplog.set_level('WARNING')
    response = api_client.get('/api/v1/bookings/my-bookings?status=bad')
    assert response.status_code == 422
    assert 'Invalid status filter' in response.json()['detail']
    assert any('Invalid status filter' in r.getMessage() for r in caplog.records)

    app.dependency_overrides.clear()
