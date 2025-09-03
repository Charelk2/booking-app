import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import BaseModel
from app.api.dependencies import get_db
from app.models import User, UserType, BookingRequest, BookingStatus
from starlette.websockets import WebSocketDisconnect


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
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)
    db.close()
    return br, artist, client


def test_ws_missing_token():
    Session = setup_app()
    br, _, _ = create_data(Session)
    client = TestClient(app)

    ws = client.websocket_connect(f"/api/v1/ws/booking-requests/{br.id}")
    with pytest.raises(Exception):
        ws.send_text("ping")

    app.dependency_overrides.clear()


def test_ws_invalid_token():
    Session = setup_app()
    br, _, _ = create_data(Session)
    client = TestClient(app)

    ws = client.websocket_connect(f"/api/v1/ws/booking-requests/{br.id}?token=bad")
    with pytest.raises(Exception):
        ws.send_text("ping")

    app.dependency_overrides.clear()
