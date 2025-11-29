import os
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["PYTEST_RUN"] = "1"

from app.main import app
from app.api.dependencies import get_db
from app.api.auth import create_access_token
from app.models.base import BaseModel
from app.models import (
    User,
    UserType,
    BookingRequest,
    Message,
    SenderType,
    MessageType,
    VisibleTo,
)


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


def auth_headers(user: User) -> dict[str, str]:
    token = create_access_token({"sub": user.email})
    return {"Authorization": f"Bearer {token}"}


def test_inbox_unread_counts_and_etag():
    Session = setup_app()
    db = Session()

    artist = User(
        email="artist@example.com",
        password="x",
        first_name="Art",
        last_name="Ist",
        user_type=UserType.SERVICE_PROVIDER,
        is_active=True,
    )
    client_user = User(
        email="client@example.com",
        password="y",
        first_name="Cli",
        last_name="Ent",
        user_type=UserType.CLIENT,
        is_active=True,
    )
    db.add_all([artist, client_user])
    db.commit()
    db.refresh(artist)
    db.refresh(client_user)

    http = TestClient(app)

    # Initial request: no notifications
    res = http.get("/api/v1/inbox/unread", headers=auth_headers(artist))
    assert res.status_code == 200
    assert res.json() == {"total": 0}
    etag_initial = res.headers.get("etag")
    assert etag_initial

    # Insert unread messages (artist is the recipient), including a system line
    booking_request = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
    )
    db.add(booking_request)
    db.commit()
    db.refresh(booking_request)

    base_ts = datetime.utcnow()
    db.add_all(
        [
            Message(
                booking_request_id=booking_request.id,
                sender_id=client_user.id,
                sender_type=SenderType.CLIENT,
                message_type=MessageType.USER,
                visible_to=VisibleTo.BOTH,
                content="Hello",
                is_read=False,
                timestamp=base_ts,
            ),
            Message(
                booking_request_id=booking_request.id,
                sender_id=client_user.id,
                sender_type=SenderType.CLIENT,
                message_type=MessageType.USER,
                visible_to=VisibleTo.BOTH,
                content="Hi again",
                is_read=False,
                timestamp=base_ts + timedelta(seconds=5),
            ),
            Message(
                booking_request_id=booking_request.id,
                sender_id=client_user.id,
                sender_type=SenderType.CLIENT,
                message_type=MessageType.SYSTEM,
                visible_to=VisibleTo.BOTH,
                content='{"type":"booking_details"}',
                is_read=False,
                timestamp=base_ts + timedelta(seconds=10),
                system_key="booking_details_v1",
            ),
        ]
    )
    db.commit()

    res2 = http.get("/api/v1/inbox/unread", headers=auth_headers(artist))
    assert res2.status_code == 200
    assert res2.json() == {"total": 3}
    etag_after = res2.headers.get("etag")
    assert etag_after and etag_after != etag_initial

    # Matching ETag should return 304 and reuse the same ETag header
    res3 = http.get(
        "/api/v1/inbox/unread",
        headers={**auth_headers(artist), "If-None-Match": etag_after},
    )
    assert res3.status_code == 304
    assert res3.headers.get("etag") == etag_after
    assert not res3.content

    db.close()
    app.dependency_overrides.clear()
