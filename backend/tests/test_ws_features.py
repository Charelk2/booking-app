import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import BaseModel
from app.api.dependencies import get_db
from app.api.auth import create_access_token
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
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="client@test.com",
        password="x",
        first_name="C",
        last_name="L",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)
    br = BookingRequest(
        client_id=client.id, artist_id=artist.id, status=BookingStatus.PENDING_QUOTE
    )
    db.add(br)
    db.commit()
    db.refresh(br)
    db.close()
    return br, artist, client


def test_reconnect_hint():
    Session = setup_app()
    br, artist, _ = create_data(Session)
    client = TestClient(app)
    token = create_access_token({"sub": artist.email})
    with client.websocket_connect(
        f"/api/v1/ws/booking-requests/{br.id}?token={token}&attempt=2"
    ) as ws:
        data = ws.receive_json()
        assert data == {"type": "reconnect_hint", "delay": 4}
        ws.close()
    app.dependency_overrides.clear()


def test_batched_typing():
    Session = setup_app()
    br, artist, _ = create_data(Session)
    client = TestClient(app)
    token = create_access_token({"sub": artist.email})
    with client.websocket_connect(
        f"/api/v1/ws/booking-requests/{br.id}?token={token}"
    ) as ws:
        ws.receive_json()  # reconnect hint
        ws.send_json({"type": "typing", "user_id": artist.id})
        ws.send_json({"type": "typing", "user_id": artist.id + 1})
        data = ws.receive_json()
        assert data["type"] == "typing"
        assert set(data["users"]) == {artist.id, artist.id + 1}
        ws.close()
    app.dependency_overrides.clear()


def test_batched_presence():
    Session = setup_app()
    br, artist, _ = create_data(Session)
    client = TestClient(app)
    token = create_access_token({"sub": artist.email})
    with client.websocket_connect(
        f"/api/v1/ws/booking-requests/{br.id}?token={token}"
    ) as ws:
        ws.receive_json()  # reconnect hint
        ws.send_json({"type": "presence", "user_id": artist.id, "status": "online"})
        ws.send_json({"type": "presence", "user_id": artist.id + 1, "status": "away"})
        data = ws.receive_json()
        assert data["type"] == "presence"
        assert data["updates"][str(artist.id)] == "online"
        assert data["updates"][str(artist.id + 1)] == "away"
        ws.close()
    app.dependency_overrides.clear()
