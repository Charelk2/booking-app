import pyotp
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models import User, UserType
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


def create_user(Session):
    db = Session()
    secret = pyotp.random_base32()
    user = User(
        email='mfa@test.com',
        password=get_password_hash('secret'),
        first_name='T',
        last_name='User',
        user_type=UserType.CLIENT,
        phone_number='123',
        mfa_secret=secret,
        mfa_enabled=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user, secret


def test_mfa_success():
    Session = setup_app()
    user, secret = create_user(Session)
    client = TestClient(app)

    res = client.post('/auth/login', data={'username': user.email, 'password': 'secret'})
    assert res.status_code == 200
    data = res.json()
    assert data['mfa_required'] is True
    token = data['mfa_token']

    code = pyotp.TOTP(secret).now()
    res2 = client.post('/auth/verify-mfa', json={'token': token, 'code': code})
    assert res2.status_code == 200
    assert 'access_token' in res2.json()

    app.dependency_overrides.pop(get_db, None)


def test_mfa_invalid_code():
    Session = setup_app()
    user, secret = create_user(Session)
    client = TestClient(app)

    res = client.post('/auth/login', data={'username': user.email, 'password': 'secret'})
    token = res.json()['mfa_token']
    res2 = client.post('/auth/verify-mfa', json={'token': token, 'code': '000000'})
    assert res2.status_code == 401

    app.dependency_overrides.pop(get_db, None)


def test_confirm_and_disable_mfa():
    Session = setup_app()
    db = Session()
    user = User(
        email='noduo@test.com',
        password=get_password_hash('secret'),
        first_name='N',
        last_name='User',
        user_type=UserType.CLIENT,
        phone_number='123',
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()

    client = TestClient(app)
    # login and get token
    res = client.post('/auth/login', data={'username': user.email, 'password': 'secret'})
    token = res.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}

    setup_res = client.post('/auth/setup-mfa', headers=headers)
    secret = setup_res.json()['secret']
    code = pyotp.TOTP(secret).now()
    confirm = client.post('/auth/confirm-mfa', json={'code': code}, headers=headers)
    assert confirm.status_code == 200

    recovery = client.post('/auth/recovery-codes', headers=headers)
    assert recovery.status_code == 200
    codes = recovery.json()['codes']
    assert len(codes) == 8

    disable = client.post('/auth/disable-mfa', json={'code': codes[0]}, headers=headers)
    assert disable.status_code == 200

    db2 = Session()
    updated = db2.query(User).filter(User.id == user.id).first()
    assert updated.mfa_enabled is False
    db2.close()

    app.dependency_overrides.pop(get_db, None)
