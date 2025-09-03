from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models import User, UserType, Service, BookingRequest, BookingStatus
from app.api.dependencies import get_db, get_current_active_client, get_current_service_provider
from app.models.base import BaseModel


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


def create_users(Session):
    db = Session()
    artist = User(email='artist@test.com', password='x', first_name='A', last_name='R', user_type=UserType.SERVICE_PROVIDER, is_active=True)
    client = User(email='client@test.com', password='x', first_name='C', last_name='L', user_type=UserType.CLIENT, is_active=True)
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)
    svc = Service(
        artist_id=artist.id,
        title='One',
        price=10,
        duration_minutes=30,
        service_type='Other',
        media_url='x',
    )
    db.add(svc)
    db.commit()
    db.refresh(svc)
    br = BookingRequest(client_id=client.id, artist_id=artist.id, status=BookingStatus.PENDING_QUOTE)
    db.add(br)
    db.commit()
    db.refresh(br)
    db.close()
    return artist, client, svc, br


def test_booking_request_invalid_service():
    Session = setup_app()
    artist, client, svc, _ = create_users(Session)

    def override_client():
        return client

    prev = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client

    client_api = TestClient(app)
    payload = {
        "artist_id": artist.id,
        "service_id": svc.id + 999,
        "status": "pending_quote",
    }
    res = client_api.post("/api/v1/booking-requests/", json=payload)
    assert res.status_code == 400
    data = res.json()
    assert data["detail"]["field_errors"]["service_id"]

    if prev is not None:
        app.dependency_overrides[get_current_active_client] = prev
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_quote_mismatched_request_id():
    Session = setup_app()
    artist, client, svc, br = create_users(Session)

    def override_artist():
        return artist

    prev = app.dependency_overrides.get(get_current_service_provider)
    app.dependency_overrides[get_current_service_provider] = override_artist

    client_api = TestClient(app)
    payload = {
        "booking_request_id": br.id + 1,
        "artist_id": artist.id,
        "client_id": client.id,
        "quote_details": "details",
        "price": "10.00",
        "currency": "ZAR",
    }
    res = client_api.post(f"/api/v1/booking-requests/{br.id}/quotes", json=payload)
    assert res.status_code == 400
    data = res.json()
    assert data["detail"]["field_errors"]["booking_request_id"] == "Mismatch"

    if prev is not None:
        app.dependency_overrides[get_current_service_provider] = prev
    else:
        app.dependency_overrides.pop(get_current_service_provider, None)

