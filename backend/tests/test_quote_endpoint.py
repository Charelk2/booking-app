from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import BaseModel
from app.api.dependencies import get_db, get_current_active_artist
from app.models import User, UserType, BookingRequest, BookingStatus


def setup_app():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
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
    artist = User(
        email="artist@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.ARTIST,
        is_active=True,
    )
    client = User(
        email="client@test.com",
        password="x",
        first_name="C",
        last_name="L",
        user_type=UserType.CLIENT,
        is_active=True,
    )
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)
    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)
    db.close()
    return artist, br


def test_create_quote_endpoint_returns_201():
    Session = setup_app()
    artist, br = create_data(Session)

    def override_artist():
        return artist

    prev = app.dependency_overrides.get(get_current_active_artist)
    app.dependency_overrides[get_current_active_artist] = override_artist

    client_api = TestClient(app)
    payload = {
        "booking_request_id": br.id,
        "quote_details": "details",
        "price": "10.00",
        "currency": "ZAR",
    }
    res = client_api.post(f"/api/v1/booking-requests/{br.id}/quotes", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["booking_request_id"] == br.id
    assert "booking_request" not in data

    if prev is not None:
        app.dependency_overrides[get_current_active_artist] = prev
    else:
        app.dependency_overrides.pop(get_current_active_artist, None)
