from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import User, UserType
from app.models.base import BaseModel
from app.api.dependencies import get_db
from app.api.auth import get_password_hash, create_access_token


def setup_app():
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

    app.dependency_overrides[get_db] = override_db
    return Session


def test_auth_me_returns_current_user():
    Session = setup_app()
    db = Session()
    user = User(
        email='me@test.com',
        password=get_password_hash('pw'),
        first_name='Me',
        last_name='User',
        user_type=UserType.CLIENT,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()

    token = create_access_token({'sub': user.email})
    client = TestClient(app)
    resp = client.get('/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 200
    data = resp.json()
    assert data['email'] == 'me@test.com'
    assert data['id'] == user.id

    app.dependency_overrides.pop(get_db, None)
