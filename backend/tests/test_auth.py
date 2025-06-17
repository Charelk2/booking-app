import time
import logging
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import BaseModel
from app.api.dependencies import get_db
from app.models import User, UserType
from app.api import auth
from app.utils.auth import get_password_hash


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
        email="foo@test.com",
        password=get_password_hash("pass"),
        first_name="Foo",
        last_name="Bar",
        user_type=UserType.CLIENT,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def test_login_lockout(monkeypatch):
    Session = setup_app()
    create_user(Session)
    client = TestClient(app)

    monkeypatch.setattr(auth, "MAX_LOGIN_ATTEMPTS", 2)
    monkeypatch.setattr(auth, "LOGIN_ATTEMPT_WINDOW_SECONDS", 60)
    monkeypatch.setattr(auth, "LOCKOUT_DURATION_SECONDS", 1)

    # fail once
    r = client.post("/auth/login", data={"username": "foo@test.com", "password": "bad"})
    assert r.status_code == 401

    # second failure triggers lockout
    r = client.post("/auth/login", data={"username": "foo@test.com", "password": "bad"})
    assert r.status_code == 429

    # locked out again
    r = client.post("/auth/login", data={"username": "foo@test.com", "password": "bad"})
    assert r.status_code == 429

    # wait for lockout to expire
    time.sleep(1.1)
    r = client.post("/auth/login", data={"username": "foo@test.com", "password": "pass"})
    assert r.status_code == 200

    # counter reset after success
    r = client.post("/auth/login", data={"username": "foo@test.com", "password": "bad"})
    assert r.status_code == 401

    app.dependency_overrides.clear()
