from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.api.dependencies import get_db
from app.api.auth import create_access_token
from app.models.base import BaseModel
from app.models import User, UserType, Notification, NotificationType


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

    user = User(
        email="artist@example.com",
        password="x",
        first_name="Art",
        last_name="Ist",
        user_type=UserType.SERVICE_PROVIDER,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    client = TestClient(app)

    # Initial request: no notifications
    res = client.get("/api/v1/inbox/unread", headers=auth_headers(user))
    assert res.status_code == 200
    assert res.json() == {"total": 0}
    etag_initial = res.headers.get("etag")
    assert etag_initial

    # Insert two unread message notifications
    base_ts = datetime.utcnow()
    db.add_all(
        [
            Notification(
                user_id=user.id,
                type=NotificationType.NEW_MESSAGE,
                message="Hello",
                link="/inbox?requestId=1",
                is_read=False,
                timestamp=base_ts,
            ),
            Notification(
                user_id=user.id,
                type=NotificationType.NEW_MESSAGE,
                message="Hi again",
                link="/inbox?requestId=1",
                is_read=False,
                timestamp=base_ts + timedelta(seconds=5),
            ),
        ]
    )
    db.commit()

    res2 = client.get("/api/v1/inbox/unread", headers=auth_headers(user))
    assert res2.status_code == 200
    assert res2.json() == {"total": 2}
    etag_after = res2.headers.get("etag")
    assert etag_after and etag_after != etag_initial

    # Matching ETag should return 304 and reuse the same ETag header
    res3 = client.get(
        "/api/v1/inbox/unread",
        headers={**auth_headers(user), "If-None-Match": etag_after},
    )
    assert res3.status_code == 304
    assert res3.headers.get("etag") == etag_after
    assert not res3.content

    db.close()
    app.dependency_overrides.clear()
