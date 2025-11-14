import os
os.environ.setdefault("PYTEST_RUN", "1")

from datetime import datetime
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, engine, SessionLocal
from app.api.dependencies import get_current_user, get_db
from app import models


def _override_get_db() -> Iterator[SessionLocal]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db() -> Iterator[None]:
    # Create all tables in the in-memory SQLite (PYTEST_RUN=1)
    Base.metadata.create_all(bind=engine)
    try:
        yield
    finally:
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session


def _mk_user(db, email: str, user_type: models.UserType, first="Jan", last="Blohm") -> models.User:
    u = models.User(
        email=email,
        password="x",
        first_name=first,
        last_name=last,
        user_type=user_type,
        is_active=True,
    )
    db.add(u)
    db.flush()
    if user_type == models.UserType.SERVICE_PROVIDER:
        prof = models.ServiceProviderProfile(user_id=u.id, business_name="Artist Biz")
        db.add(prof)
    db.commit()
    db.refresh(u)
    return u


def _mk_service(db, artist_id: int, service_type: str) -> models.Service:
    s = models.Service(
        artist_id=artist_id,
        title="Test Service",
        description="",
        media_url="",
        price=100,
        currency="ZAR",
        duration_minutes=30,
        service_type=service_type,
        status="approved",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _mk_request(db, client_id: int, artist_id: int, service_id: int | None = None) -> models.BookingRequest:
    br = models.BookingRequest(
        client_id=client_id,
        artist_id=artist_id,
        service_id=service_id,
        status=models.BookingStatus.PENDING_QUOTE,
        created_at=datetime.utcnow(),
    )
    db.add(br)
    db.commit()
    db.refresh(br)
    return br


def _mk_message(
    db,
    booking_request_id: int,
    sender_id: int,
    sender_type: models.SenderType,
    content: str,
    message_type: models.MessageType = models.MessageType.SYSTEM,
    visible_to: models.VisibleTo = models.VisibleTo.BOTH,
    system_key: str | None = None,
):
    m = models.Message(
        booking_request_id=booking_request_id,
        sender_id=sender_id,
        sender_type=sender_type,
        content=content,
        message_type=message_type,
        visible_to=visible_to,
        system_key=system_key,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def test_threads_preview_single_query_path(db):
    # Arrange users
    client = _mk_user(db, "client@example.com", models.UserType.CLIENT)
    artist = _mk_user(db, "artist@example.com", models.UserType.SERVICE_PROVIDER)

    # Non-PV request with booking details system message → shows as "New Booking Request"
    br1 = _mk_request(db, client.id, artist.id, service_id=None)
    _mk_message(
        db,
        booking_request_id=br1.id,
        sender_id=artist.id,
        sender_type=models.SenderType.ARTIST,
        content=("Booking details:" "\nEvent Type: Test\nLocation: Cape Town"),
        message_type=models.MessageType.SYSTEM,
        visible_to=models.VisibleTo.BOTH,
        system_key="booking_details_v1",
    )

    # PV unpaid → should be excluded from preview
    pv_service = _mk_service(db, artist.artist_profile.user_id, models.ServiceType.PERSONALIZED_VIDEO.value)
    br2 = _mk_request(db, client.id, artist.id, service_id=pv_service.id)
    _mk_message(
        db,
        booking_request_id=br2.id,
        sender_id=client.id,
        sender_type=models.SenderType.CLIENT,
        content="Hello",
        message_type=models.MessageType.USER,
        visible_to=models.VisibleTo.BOTH,
    )

    # PV paid → include, with payment_received label
    br3 = _mk_request(db, client.id, artist.id, service_id=pv_service.id)
    _mk_message(
        db,
        booking_request_id=br3.id,
        sender_id=artist.id,
        sender_type=models.SenderType.ARTIST,
        content="Payment received. Booking confirmed.",
        message_type=models.MessageType.SYSTEM,
        visible_to=models.VisibleTo.BOTH,
        system_key="payment_received_v1",
    )

    # Override dependencies: DB + current user
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: client

    with TestClient(app) as http:
        # Act: first 200
        r = http.get("/api/v1/message-threads/preview", params={"role": "client", "limit": 100})
        assert r.status_code == 200, r.text
        assert r.headers.get("ETag")
        data = r.json()
        tids = [it["thread_id"] for it in data["items"]]
        # PV unpaid excluded; PV paid included; booking-details included
        assert br1.id in tids
        assert br3.id in tids
        assert br2.id not in tids

        # Label keys present as expected
        items_by_id = {it["thread_id"]: it for it in data["items"]}
        assert items_by_id[br1.id].get("preview_key") == "new_booking_request"
        assert items_by_id[br3.id].get("preview_key") == "payment_received"


def test_threads_preview_requested_without_messages_uses_fallback_label(db):
    # Arrange a client and artist with a brand-new booking request that has no messages yet.
    client = _mk_user(db, "fresh-client@example.com", models.UserType.CLIENT)
    artist = _mk_user(db, "fresh-artist@example.com", models.UserType.SERVICE_PROVIDER)
    br = _mk_request(db, client.id, artist.id, service_id=None)

    # Sanity: booking status maps to "requested" state in the preview helper.
    assert br.status == models.BookingStatus.PENDING_QUOTE

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: client

    with TestClient(app) as http:
        r = http.get("/api/v1/message-threads/preview", params={"role": "client", "limit": 100})
        assert r.status_code == 200, r.text
        data = r.json()
        items_by_id = {it["thread_id"]: it for it in data["items"]}
        assert br.id in items_by_id
        item = items_by_id[br.id]
        # Brand-new requested threads without messages should still surface a
        # neutral label so the Inbox preview does not go blank after hydration.
        assert item["last_message_preview"] == "New Booking Request"
        # And they should carry a semantic preview_key so the client can render
        # consistent badges/tags for new booking requests.
        assert item.get("preview_key") == "new_booking_request"

        # Act: 304 with If-None-Match
        etag = r.headers["ETag"]
        r2 = http.get(
            "/api/v1/message-threads/preview",
            params={"role": "client", "limit": 100},
            headers={"If-None-Match": etag},
        )
        assert r2.status_code == 304
