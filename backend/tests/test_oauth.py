import types
from fastapi.testclient import TestClient
from fastapi.responses import RedirectResponse
from sqlalchemy import create_engine, func
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models import User, UserType
from app.models.base import BaseModel
from app.api.dependencies import get_db
from app.api import api_oauth
from app.api.auth import SECRET_KEY, ALGORITHM
from app.core.config import settings
import jwt


def setup_app(monkeypatch):
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


class DummyResponse:
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


async def fake_authorize_access_token(request):
    return {"access_token": "token"}


async def fake_parse_id_token(request, token):
    return {
        "email": "new@example.com",
        "given_name": "New",
        "family_name": "User",
    }


def test_google_oauth_creates_user(monkeypatch):
    Session = setup_app(monkeypatch)
    monkeypatch.setattr(
        api_oauth.oauth,
        "google",
        types.SimpleNamespace(
            authorize_access_token=fake_authorize_access_token,
            parse_id_token=fake_parse_id_token,
        ),
        raising=False,
    )

    client = TestClient(app)
    res = client.get("/auth/google/callback?code=x&state=/done", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"].startswith("http://localhost:3000/login?token=")
    assert "next=%2Fdone" in res.headers["location"]
    token = res.headers["location"].split("token=")[1].split("&")[0]
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "new@example.com"

    db = Session()
    user = db.query(User).filter(User.email == "new@example.com").first()
    assert user is not None
    assert user.is_verified is True
    db.close()

    app.dependency_overrides.pop(get_db, None)


def test_google_oauth_updates_user(monkeypatch):
    Session = setup_app(monkeypatch)
    db = Session()
    user = User(
        email="new@example.com",
        password="x",
        first_name="Existing",
        last_name="User",
        user_type=UserType.CLIENT,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.close()

    monkeypatch.setattr(
        api_oauth.oauth,
        "google",
        types.SimpleNamespace(
            authorize_access_token=fake_authorize_access_token,
            parse_id_token=fake_parse_id_token,
        ),
        raising=False,
    )

    client = TestClient(app)
    res = client.get("/auth/google/callback?code=x&state=/here", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"].startswith("http://localhost:3000/login?token=")
    assert "next=%2Fhere" in res.headers["location"]
    token = res.headers["location"].split("token=")[1].split("&")[0]
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "new@example.com"

    db = Session()
    users = db.query(User).filter(User.email == "new@example.com").all()
    assert len(users) == 1
    assert users[0].first_name == "Existing"
    assert users[0].is_verified is True
    db.close()

    app.dependency_overrides.pop(get_db, None)


async def fake_github_get(endpoint, token=None):
    if endpoint == "user":
        return DummyResponse(
            {"login": "gh", "name": "GH User", "email": "gh@example.com"}
        )
    return DummyResponse([{"email": "gh@example.com", "primary": True}])


def test_github_oauth_updates_user(monkeypatch):
    Session = setup_app(monkeypatch)
    db = Session()
    user = User(
        email="gh@example.com",
        password="x",
        first_name="Existing",
        last_name="User",
        user_type=UserType.CLIENT,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.close()

    monkeypatch.setattr(
        api_oauth.oauth,
        "github",
        types.SimpleNamespace(
            authorize_access_token=fake_authorize_access_token,
            get=fake_github_get,
        ),
        raising=False,
    )

    client = TestClient(app)
    res = client.get("/auth/github/callback?code=x&state=/next", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"].startswith("http://localhost:3000/login?token=")
    assert "next=%2Fnext" in res.headers["location"]
    token = res.headers["location"].split("token=")[1].split("&")[0]
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "gh@example.com"

    db = Session()
    updated = db.query(User).filter(User.email == "gh@example.com").first()
    assert updated is not None
    assert updated.is_verified is True
    assert updated.first_name == "Existing"
    db.close()

    app.dependency_overrides.pop(get_db, None)


def test_github_login_default_next(monkeypatch):
    Session = setup_app(monkeypatch)
    captured = {}

    async def fake_redirect(req, redirect_uri, state=None):
        captured["state"] = state
        return RedirectResponse(url=redirect_uri)

    monkeypatch.setattr(
        api_oauth.oauth,
        "github",
        types.SimpleNamespace(authorize_redirect=fake_redirect),
        raising=False,
    )
    client = TestClient(app)
    resp = client.get("/auth/github/login", follow_redirects=False)
    assert resp.status_code == 307
    assert captured["state"] == settings.FRONTEND_URL.rstrip("/") + "/dashboard"
    app.dependency_overrides.pop(get_db, None)


def test_github_login_redirects_to_dashboard(monkeypatch):
    Session = setup_app(monkeypatch)
    captured = {}

    async def fake_redirect(req, redirect_uri, state=None):
        captured["state"] = state
        return RedirectResponse(url=redirect_uri)

    monkeypatch.setattr(
        api_oauth.oauth,
        "github",
        types.SimpleNamespace(
            authorize_redirect=fake_redirect,
            authorize_access_token=fake_authorize_access_token,
            get=fake_github_get,
        ),
        raising=False,
    )
    client = TestClient(app)
    resp = client.get("/auth/github/login", follow_redirects=False)
    assert resp.status_code == 307
    assert captured["state"] == settings.FRONTEND_URL.rstrip("/") + "/dashboard"

    cb = client.get(
        f'/auth/github/callback?code=x&state={captured["state"]}',
        follow_redirects=False,
    )
    assert cb.status_code == 307
    assert cb.headers["location"].startswith(
        settings.FRONTEND_URL.rstrip("/") + "/login?token="
    )
    assert "next=%2Fdashboard" in cb.headers["location"]
    app.dependency_overrides.pop(get_db, None)


def test_google_login_sets_session(monkeypatch):
    Session = setup_app(monkeypatch)

    async def fake_redirect(req, redirect_uri, state=None):
        req.session["oauth_state"] = state
        return RedirectResponse(url=redirect_uri)

    monkeypatch.setattr(
        api_oauth.oauth,
        "google",
        types.SimpleNamespace(authorize_redirect=fake_redirect),
        raising=False,
    )
    client = TestClient(app)
    resp = client.get("/auth/google/login?next=/dash", follow_redirects=False)
    assert resp.status_code == 307
    assert "session=" in resp.headers.get("set-cookie", "")
    app.dependency_overrides.pop(get_db, None)


def test_google_login_default_next(monkeypatch):
    Session = setup_app(monkeypatch)
    captured = {}

    async def fake_redirect(req, redirect_uri, state=None):
        captured["state"] = state
        return RedirectResponse(url=redirect_uri)

    monkeypatch.setattr(
        api_oauth.oauth,
        "google",
        types.SimpleNamespace(authorize_redirect=fake_redirect),
        raising=False,
    )
    client = TestClient(app)
    resp = client.get("/auth/google/login", follow_redirects=False)
    assert resp.status_code == 307
    assert captured["state"] == settings.FRONTEND_URL.rstrip("/") + "/dashboard"
    app.dependency_overrides.pop(get_db, None)


def test_google_login_redirects_to_dashboard(monkeypatch):
    """Login without ?next= should redirect to /dashboard."""
    Session = setup_app(monkeypatch)
    captured = {}

    async def fake_redirect(req, redirect_uri, state=None):
        captured["state"] = state
        return RedirectResponse(url=redirect_uri)

    monkeypatch.setattr(
        api_oauth.oauth,
        "google",
        types.SimpleNamespace(
            authorize_redirect=fake_redirect,
            authorize_access_token=fake_authorize_access_token,
            parse_id_token=fake_parse_id_token,
        ),
        raising=False,
    )
    client = TestClient(app)

    resp = client.get("/auth/google/login", follow_redirects=False)
    assert resp.status_code == 307
    assert captured["state"] == settings.FRONTEND_URL.rstrip("/") + "/dashboard"

    cb = client.get(
        f'/auth/google/callback?code=x&state={captured["state"]}',
        follow_redirects=False,
    )
    assert cb.status_code == 307
    assert cb.headers["location"].startswith(
        settings.FRONTEND_URL.rstrip("/") + "/login?token="
    )
    assert "next=%2Fdashboard" in cb.headers["location"]

    app.dependency_overrides.pop(get_db, None)


def test_oauth_merges_case_insensitive_email(monkeypatch):
    Session = setup_app(monkeypatch)
    db = Session()
    user = User(
        email="Case@Example.com",
        password="x",
        first_name="Case",
        last_name="User",
        user_type=UserType.CLIENT,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.close()

    async def fake_authorize_access_token(request):
        return {"access_token": "token"}

    async def fake_parse_id_token(request, token):
        return {
            "email": "case@example.com",
            "given_name": "New",
            "family_name": "Name",
        }

    monkeypatch.setattr(
        api_oauth.oauth,
        "google",
        types.SimpleNamespace(
            authorize_access_token=fake_authorize_access_token,
            parse_id_token=fake_parse_id_token,
        ),
        raising=False,
    )
    client = TestClient(app)
    res = client.get("/auth/google/callback?code=x&state=/done", follow_redirects=False)
    assert res.status_code == 307

    db = Session()
    users = db.query(User).filter(func.lower(User.email) == "case@example.com").all()
    assert len(users) == 1
    assert users[0].first_name == "Case"
    assert users[0].is_verified is True
    db.close()

    app.dependency_overrides.pop(get_db, None)


def test_oauth_merges_gmail_alias(monkeypatch):
    """Gmail aliases should resolve to an existing user."""
    Session = setup_app(monkeypatch)
    db = Session()
    user = User(
        email="user@gmail.com",
        password="x",
        first_name="Us",
        last_name="Er",
        user_type=UserType.CLIENT,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.close()

    async def fake_authorize_access_token(request):
        return {"access_token": "token"}

    async def fake_parse_id_token(request, token):
        return {
            "email": "u.ser+spam@googlemail.com",
            "given_name": "New",
            "family_name": "Name",
        }

    monkeypatch.setattr(
        api_oauth.oauth,
        "google",
        types.SimpleNamespace(
            authorize_access_token=fake_authorize_access_token,
            parse_id_token=fake_parse_id_token,
        ),
        raising=False,
    )
    client = TestClient(app)
    res = client.get("/auth/google/callback?code=x&state=/done", follow_redirects=False)
    assert res.status_code == 307

    db = Session()
    users = db.query(User).filter(func.lower(User.email) == "user@gmail.com").all()
    assert len(users) == 1
    db.close()

    app.dependency_overrides.pop(get_db, None)


def test_google_oauth_token_error(monkeypatch):
    Session = setup_app(monkeypatch)

    async def bad_authorize_access_token(request):
        raise Exception("boom")

    monkeypatch.setattr(
        api_oauth.oauth,
        "google",
        types.SimpleNamespace(authorize_access_token=bad_authorize_access_token),
        raising=False,
    )

    client = TestClient(app)
    res = client.get("/auth/google/callback?code=x&state=/done", follow_redirects=False)
    assert res.status_code == 400
    data = res.json()
    assert data["detail"]["message"] == "Google authentication failed"
    assert data["detail"]["field_errors"] == {}

    app.dependency_overrides.pop(get_db, None)
