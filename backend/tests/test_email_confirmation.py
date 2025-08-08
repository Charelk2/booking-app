from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import datetime, timedelta

from app.main import app
from app.models import User, UserType, EmailToken
from app.models.base import BaseModel
from app.api.auth import get_db
from app.utils.auth import get_password_hash


def setup_app():
    engine = create_engine(
        'sqlite:///:memory:',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    return Session


def create_user(Session, expired: bool = False):
    db = Session()
    user = User(
        email='new@test.com',
        password=get_password_hash('secret'),
        first_name='N',
        last_name='User',
        phone_number='123',
        user_type=UserType.CLIENT,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    expiry = datetime.utcnow() + timedelta(hours=-1 if expired else 1)
    token = EmailToken(
        user_id=user.id,
        token='tok',
        expires_at=expiry,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    token_value = token.token
    user_id = user.id
    db.close()
    return user_id, token_value, Session


def test_token_created_on_register():
    Session = setup_app()
    client = TestClient(app)

    res = client.post(
        '/auth/register',
        json={
            'email': 'test@example.com',
            'password': 'secret',
            'first_name': 'T',
            'last_name': 'User',
            'phone_number': '123',
            'user_type': 'client',
        },
    )
    assert res.status_code == 200
    db = Session()
    tokens = db.query(EmailToken).all()
    db.close()
    assert len(tokens) == 1

    app.dependency_overrides.pop(get_db, None)


def test_service_provider_auto_verified():
    Session = setup_app()
    client = TestClient(app)

    res = client.post(
        '/auth/register',
        json={
            'email': 'sp@test.com',
            'password': 'secret',
            'first_name': 'S',
            'last_name': 'Provider',
            'phone_number': '123',
            'user_type': 'service_provider',
        },
    )
    assert res.status_code == 200
    db = Session()
    user_db = db.query(User).filter(User.email == 'sp@test.com').first()
    token = db.query(EmailToken).filter(EmailToken.user_id == user_db.id).first()
    db.close()
    assert user_db.is_verified is True
    assert token is None
    app.dependency_overrides.pop(get_db, None)


def test_confirm_email():
    Session = setup_app()
    user_id, token, _ = create_user(Session)
    client = TestClient(app)
    res = client.post('/auth/confirm-email', json={'token': token})
    assert res.status_code == 200
    db = Session()
    user_db = db.query(User).filter(User.id == user_id).first()
    remaining = db.query(EmailToken).filter(EmailToken.user_id == user_id).first()
    verified = user_db.is_verified
    db.close()
    assert verified is True
    assert remaining is None
    app.dependency_overrides.pop(get_db, None)


def test_confirm_email_invalid_token():
    Session = setup_app()
    client = TestClient(app)
    res = client.post('/auth/confirm-email', json={'token': 'bad'})
    assert res.status_code == 400
    assert res.json()['detail'] == 'Invalid or expired token'
    app.dependency_overrides.pop(get_db, None)


def test_confirm_email_expired_token():
    Session = setup_app()
    user_id, token, _ = create_user(Session, expired=True)
    client = TestClient(app)
    res = client.post('/auth/confirm-email', json={'token': token})
    assert res.status_code == 400
    assert res.json()['detail'] == 'Invalid or expired token'
    db = Session()
    user = db.query(User).filter(User.id == user_id).first()
    db.close()
    assert user.is_verified is False
    app.dependency_overrides.pop(get_db, None)


