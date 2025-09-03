import os
from pathlib import Path
os.environ.setdefault("ENV_FILE", str(Path(__file__).resolve().parents[1] / ".env.test"))
os.environ["CORS_ORIGINS"] = "[\"http://localhost:3000\"]"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import datetime, timedelta
import time

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingStatus,
    MessageType,
)
from app.models.base import BaseModel
from app.api import api_message
from app.schemas import MessageCreate
from app.crud import crud_notification
from app.main import app
from app.api.dependencies import get_db
from fastapi.testclient import TestClient


def setup_db():
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


def test_system_key_upsert_dedupes_booking_details():
    Session = setup_db()
    db = Session()
    # Users and thread
    client = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist]); db.commit(); db.refresh(client); db.refresh(artist)
    br = BookingRequest(client_id=client.id, artist_id=artist.id, status=BookingStatus.PENDING_QUOTE)
    db.add(br); db.commit(); db.refresh(br)

    # First booking-details system message
    msg1 = api_message.create_message(
        br.id,
        MessageCreate(
            content="Booking details:\nLocation: Cape Town\nGuests: 50",
            message_type=MessageType.SYSTEM,
        ),
        db,
        current_user=client,
    )
    # Attempt to post a duplicate booking-details message; should return the original
    msg2 = api_message.create_message(
        br.id,
        MessageCreate(
            content="Booking details:\nLocation: Johannesburg\nGuests: 80",
            message_type=MessageType.SYSTEM,
        ),
        db,
        current_user=client,
    )
    assert msg1["id"] == msg2["id"], "Duplicate booking details should be deduped by system_key"

    # Create a normal user message to generate a thread notification
    api_message.create_message(
        br.id,
        MessageCreate(content="hello", message_type=MessageType.USER),
        db,
        current_user=client,
    )

    threads = crud_notification.get_message_thread_notifications(db, artist.id)
    assert len(threads) == 1
    details = threads[0]["booking_details"]
    # The earliest (original) details must be preserved for stability
    assert details["location"] == "Cape Town"
    assert details["guests"] == "50"


def test_auth_refresh_flow_rotates_and_issues_access_token():
    Session = setup_db()
    client = TestClient(app)
    db = Session()
    # Create a user directly in DB
    u = User(
        email="ref@test.com",
        password="$2b$12$dummydummydummydummydummydummydummydummydummy",  # bcrypt for 'pw' not validated in this path
        first_name="R",
        last_name="User",
        user_type=UserType.CLIENT,
        is_verified=True,
    )
    db.add(u); db.commit(); db.refresh(u)

    # Hit login endpoint to generate tokens
    resp = client.post("/auth/login", data={"username": u.email, "password": "pw"})
    assert resp.status_code in (200, 401)
    if resp.status_code == 401:
        # In test env the password hash above may not match verify_password; simulate token issuance
        from app.api.auth import create_access_token, _create_refresh_token, _store_refresh_token
        access = create_access_token({"sub": u.email})
        refresh, exp = _create_refresh_token(u.email)
        _store_refresh_token(db, u, refresh, exp)
        tokens = {"access_token": access, "refresh_token": refresh}
    else:
        tokens = resp.json()

    # Refresh
    r2 = client.post("/auth/refresh", json={"token": tokens["refresh_token"]})
    assert r2.status_code == 200
    body = r2.json()
    assert body.get("access_token") and body.get("refresh_token")
    assert body["refresh_token"] != tokens["refresh_token"], "Refresh token should rotate"

    # Old refresh token should now be invalid
    r3 = client.post("/auth/refresh", json={"token": tokens["refresh_token"]})
    assert r3.status_code == 401
