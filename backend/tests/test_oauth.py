import types
from fastapi import HTTPException
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
from urllib.parse import parse_qs, urlparse


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


class DummyAsyncRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.fail_writes = False
        self.fail_reads = False

    async def setex(self, key: str, ttl: int, value: str) -> None:
        if self.fail_writes:
            raise RuntimeError("redis down")
        self.store[key] = value

    async def get(self, key: str):
        if self.fail_reads:
            raise RuntimeError("redis down")
        return self.store.get(key)

    async def delete(self, *keys: str) -> int:
        removed = 0
        for key in keys:
            if key in self.store:
                del self.store[key]
                removed += 1
        return removed


def configure_google(monkeypatch) -> DummyAsyncRedis:
    redis_stub = DummyAsyncRedis()
    monkeypatch.setattr(api_oauth, "redis", redis_stub, raising=False)
    monkeypatch.setattr(api_oauth, "GOOGLE_CLIENT_ID", "test-google-client", raising=False)
    monkeypatch.setattr(api_oauth, "GOOGLE_CLIENT_SECRET", "test-google-secret", raising=False)
    monkeypatch.setattr(
        api_oauth,
        "GOOGLE_REDIRECT_URI",
        "https://api.example.com/auth/google/callback",
        raising=False,
    )
    monkeypatch.setattr(
        api_oauth,
        "oauth",
        types.SimpleNamespace(google=types.SimpleNamespace()),
        raising=False,
    )
    monkeypatch.setattr(api_oauth, "FRONTEND_PRIMARY", "https://booka.co.za", raising=False)
    return redis_stub


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
    configure_google(monkeypatch)

    async def fake_exchange(code):
        assert code == "code123"
        return {"access_token": "token"}

    async def fake_profile(request, token):
        return {
            "email": "new@example.com",
            "given_name": "New",
            "family_name": "User",
        }

    monkeypatch.setattr(api_oauth, "_exchange_google_code_for_tokens", fake_exchange, raising=False)
    monkeypatch.setattr(api_oauth, "_fetch_google_profile", fake_profile, raising=False)

    client = TestClient(app)
    login = client.get("/auth/google/login?next=/done", follow_redirects=False)
    assert login.status_code == 302
    assert login.headers["location"].startswith("https://accounts.google.com/")
    qs = parse_qs(urlparse(login.headers["location"]).query)
    state = qs["state"][0]

    cb = client.get(f"/auth/google/callback?code=code123&state={state}", follow_redirects=False)
    assert cb.status_code == 302
    assert cb.headers["location"] == "https://booka.co.za/done"

    set_cookie_header = cb.headers.get("set-cookie", "")
    assert "access_token=" in set_cookie_header
    assert "Domain=.booka.co.za" in set_cookie_header
    assert "HttpOnly" in set_cookie_header
    assert "Secure" in set_cookie_header
    assert "SameSite=None" in set_cookie_header

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

    configure_google(monkeypatch)

    async def fake_exchange(code):
        assert code == "code123"
        return {"access_token": "token"}

    async def fake_profile(request, token):
        return {
            "email": "new@example.com",
            "given_name": "New",
            "family_name": "User",
        }

    monkeypatch.setattr(api_oauth, "_exchange_google_code_for_tokens", fake_exchange, raising=False)
    monkeypatch.setattr(api_oauth, "_fetch_google_profile", fake_profile, raising=False)

    client = TestClient(app)
    login = client.get("/auth/google/login?next=/here", follow_redirects=False)
    qs = parse_qs(urlparse(login.headers["location"]).query)
    state = qs["state"][0]

    res = client.get(f"/auth/google/callback?code=code123&state={state}", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"] == "https://booka.co.za/here"

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
    redis_stub = configure_google(monkeypatch)
    client = TestClient(app)
    resp = client.get("/auth/google/login?next=/dash", follow_redirects=False)
    assert resp.status_code == 302
    qs = parse_qs(urlparse(resp.headers["location"]).query)
    state = qs["state"][0]
    assert state.startswith("redis:")
    state_id = state.split(":", 1)[1]
    assert redis_stub.store[f"oauth:state:{state_id}"] == "1"
    assert redis_stub.store[f"oauth:next:{state_id}"] == "/dash"
    app.dependency_overrides.pop(get_db, None)


def test_google_login_default_next(monkeypatch):
    Session = setup_app(monkeypatch)
    redis_stub = configure_google(monkeypatch)
    client = TestClient(app)
    resp = client.get("/auth/google/login", follow_redirects=False)
    assert resp.status_code == 302
    state = parse_qs(urlparse(resp.headers["location"]).query)["state"][0]
    assert state.startswith("redis:")
    state_id = state.split(":", 1)[1]
    assert redis_stub.store[f"oauth:next:{state_id}"] == "/dashboard"
    app.dependency_overrides.pop(get_db, None)


def test_google_login_rewrites_login_next(monkeypatch):
    Session = setup_app(monkeypatch)
    redis_stub = configure_google(monkeypatch)

    async def fake_exchange(code):
        return {"access_token": "token"}

    async def fake_profile(request, token):
        return {
            "email": "loop@example.com",
            "given_name": "Loop",
            "family_name": "Breaker",
        }

    monkeypatch.setattr(api_oauth, "_exchange_google_code_for_tokens", fake_exchange, raising=False)
    monkeypatch.setattr(api_oauth, "_fetch_google_profile", fake_profile, raising=False)

    client = TestClient(app)
    resp = client.get("/auth/google/login?next=/login", follow_redirects=False)
    assert resp.status_code == 302
    state = parse_qs(urlparse(resp.headers["location"]).query)["state"][0]
    assert state.startswith("redis:")
    state_id = state.split(":", 1)[1]
    assert redis_stub.store[f"oauth:next:{state_id}"] == "/dashboard"

    cb = client.get(f"/auth/google/callback?code=ok&state={state}", follow_redirects=False)
    assert cb.status_code == 302
    assert cb.headers["location"] == "https://booka.co.za/dashboard"

    app.dependency_overrides.pop(get_db, None)


def test_google_login_redirects_to_dashboard(monkeypatch):
    """Login without ?next= should redirect to /dashboard."""
    Session = setup_app(monkeypatch)
    configure_google(monkeypatch)

    async def fake_exchange(code):
        return {"access_token": "token"}

    async def fake_profile(request, token):
        return {
            "email": "dash@example.com",
            "given_name": "Dash",
            "family_name": "Board",
        }

    monkeypatch.setattr(api_oauth, "_exchange_google_code_for_tokens", fake_exchange, raising=False)
    monkeypatch.setattr(api_oauth, "_fetch_google_profile", fake_profile, raising=False)

    client = TestClient(app)
    login = client.get("/auth/google/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]

    cb = client.get(
        f"/auth/google/callback?code=ok&state={state}",
        follow_redirects=False,
    )
    assert cb.status_code == 302
    assert cb.headers["location"] == "https://booka.co.za/dashboard"

    app.dependency_overrides.pop(get_db, None)


def test_google_login_uses_signed_state_when_redis_down(monkeypatch):
    Session = setup_app(monkeypatch)
    redis_stub = configure_google(monkeypatch)
    redis_stub.fail_writes = True
    redis_stub.fail_reads = True

    async def fake_exchange(code):
        return {"access_token": "token"}

    async def fake_profile(request, token):
        return {
            "email": "signed@example.com",
            "given_name": "Signed",
            "family_name": "State",
        }

    monkeypatch.setattr(api_oauth, "_exchange_google_code_for_tokens", fake_exchange, raising=False)
    monkeypatch.setattr(api_oauth, "_fetch_google_profile", fake_profile, raising=False)

    client = TestClient(app)
    login = client.get("/auth/google/login?next=/signed", follow_redirects=False)
    assert login.status_code == 302
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    assert state.startswith("sig:")

    callback = client.get(f"/auth/google/callback?code=ok&state={state}", follow_redirects=False)
    assert callback.status_code == 302
    assert callback.headers["location"] == "https://booka.co.za/signed"

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

    configure_google(monkeypatch)

    async def fake_exchange(code):
        return {"access_token": "token"}

    async def fake_profile(request, token):
        return {
            "email": "case@example.com",
            "given_name": "New",
            "family_name": "Name",
        }

    monkeypatch.setattr(api_oauth, "_exchange_google_code_for_tokens", fake_exchange, raising=False)
    monkeypatch.setattr(api_oauth, "_fetch_google_profile", fake_profile, raising=False)

    client = TestClient(app)
    login = client.get("/auth/google/login?next=/done", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    res = client.get(f"/auth/google/callback?code=ok&state={state}", follow_redirects=False)
    assert res.status_code == 302

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

    configure_google(monkeypatch)

    async def fake_exchange(code):
        return {"access_token": "token"}

    async def fake_profile(request, token):
        return {
            "email": "u.ser+spam@googlemail.com",
            "given_name": "New",
            "family_name": "Name",
        }

    monkeypatch.setattr(api_oauth, "_exchange_google_code_for_tokens", fake_exchange, raising=False)
    monkeypatch.setattr(api_oauth, "_fetch_google_profile", fake_profile, raising=False)

    client = TestClient(app)
    login = client.get("/auth/google/login?next=/done", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    res = client.get(f"/auth/google/callback?code=ok&state={state}", follow_redirects=False)
    assert res.status_code == 302

    db = Session()
    users = db.query(User).filter(func.lower(User.email) == "user@gmail.com").all()
    assert len(users) == 1
    db.close()

    app.dependency_overrides.pop(get_db, None)


def test_google_oauth_token_error(monkeypatch):
    Session = setup_app(monkeypatch)

    configure_google(monkeypatch)

    async def bad_exchange(code):
        raise HTTPException(status_code=400, detail="boom")

    monkeypatch.setattr(api_oauth, "_exchange_google_code_for_tokens", bad_exchange, raising=False)

    client = TestClient(app)
    login = client.get("/auth/google/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    res = client.get(
        f"/auth/google/callback?code=bad&state={state}",
        follow_redirects=False,
    )
    assert res.status_code == 302
    assert res.headers["location"] == "https://booka.co.za/login?oauth_error=token"

    app.dependency_overrides.pop(get_db, None)
