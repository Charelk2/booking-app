import time
import fakeredis
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models import User, UserType
from app.models.base import BaseModel
from app.api.auth import get_db
from app.api import auth as auth_module
from app.utils.auth import get_password_hash
from app.utils import redis_cache


def setup_app(monkeypatch):
    engine = create_engine(
        'sqlite:///:memory:',
        connect_args={'check_same_thread': False},
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

    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(redis_cache, 'get_redis_client', lambda: fake)
    monkeypatch.setattr(auth_module, 'get_redis_client', lambda: fake)

    app.dependency_overrides[get_db] = override_db
    return Session, fake


def create_user(Session):
    db = Session()
    user = User(
        email='lock@test.com',
        password=get_password_hash('secret'),
        first_name='T',
        last_name='User',
        user_type=UserType.CLIENT,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def test_lockout_and_reset(monkeypatch):
    Session, fake = setup_app(monkeypatch)
    user = create_user(Session)
    client = TestClient(app)

    monkeypatch.setattr(auth_module.settings, 'MAX_LOGIN_ATTEMPTS', 3, raising=False)
    monkeypatch.setattr(auth_module.settings, 'LOGIN_ATTEMPT_WINDOW', 1, raising=False)

    for _ in range(3):
        res = client.post('/auth/login', data={'username': user.email, 'password': 'bad'})
        assert res.status_code == 401

    res = client.post('/auth/login', data={'username': user.email, 'password': 'bad'})
    assert res.status_code == 429

    time.sleep(1.1)
    res = client.post('/auth/login', data={'username': user.email, 'password': 'secret'})
    assert res.status_code == 200

    for _ in range(3):
        res = client.post('/auth/login', data={'username': user.email, 'password': 'wrong'})
        assert res.status_code == 401

    res = client.post('/auth/login', data={'username': user.email, 'password': 'wrong'})
    assert res.status_code == 429

    app.dependency_overrides.pop(get_db, None)
