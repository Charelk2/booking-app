import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import BaseModel
from app.api.dependencies import get_db
from app.models import User, UserType
from app.api.auth import create_access_token
from app.utils.notifications import _create_and_broadcast
from app.schemas.notification import NotificationType


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


def create_user(Session):
    db = Session()
    user = User(
        email="user@test.com",
        password="x",
        first_name="U",
        last_name="S",
        user_type=UserType.CLIENT,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def test_notifications_ws_requires_token():
    Session = setup_app()
    create_user(Session)
    client = TestClient(app)

    ws = client.websocket_connect("/api/v1/ws/notifications")
    with pytest.raises(Exception):
        ws.send_text("ping")

    app.dependency_overrides.clear()


def test_notifications_ws_broadcasts(patch_notifications_broadcast):
    """Ensure notifications are broadcast to connected WebSocket users."""
    Session = setup_app()
    user = create_user(Session)
    client = TestClient(app)

    token = create_access_token({"sub": user.email})

    with client.websocket_connect(f"/api/v1/ws/notifications?token={token}"):
        db = Session()
        _create_and_broadcast(
            db,
            user.id,
            NotificationType.NEW_MESSAGE,
            "hello",
            "/x",
        )
        db.close()
        # Allow background tasks to execute
        import time
        time.sleep(0.1)

    assert patch_notifications_broadcast.call_count >= 1
    args, _ = patch_notifications_broadcast.call_args
    assert args[0] == user.id
    assert args[1]["message"] == "hello"
    assert isinstance(args[1]["timestamp"], str)

    app.dependency_overrides.clear()

