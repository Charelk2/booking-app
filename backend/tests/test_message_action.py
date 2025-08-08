from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingStatus,
    SenderType,
    MessageType,
    VisibleTo,
)
from app.models.message import MessageAction
from app.models.base import BaseModel
from app.api.dependencies import get_db
from app.api.auth import create_access_token
from app.crud import crud_message


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


def test_message_action_included_in_response():
    Session = setup_app()
    db = Session()
    client_user = User(
        email="client@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
        is_verified=True,
    )
    artist_user = User(
        email="artist@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
        is_verified=True,
    )
    db.add_all([client_user, artist_user])
    db.commit()
    db.refresh(client_user)
    db.refresh(artist_user)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist_user.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    crud_message.create_message(
        db,
        booking_request_id=br.id,
        sender_id=artist_user.id,
        sender_type=SenderType.ARTIST,
        content="Review the quote details.",
        message_type=MessageType.SYSTEM,
        visible_to=VisibleTo.ARTIST,
        action=MessageAction.REVIEW_QUOTE,
    )

    token = create_access_token({"sub": artist_user.email})
    client = TestClient(app)
    resp = client.get(
        f"/api/v1/booking-requests/{br.id}/messages",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    messages = resp.json()
    assert len(messages) == 1
    assert messages[0]["action"] == "review_quote"

    app.dependency_overrides.pop(get_db, None)
