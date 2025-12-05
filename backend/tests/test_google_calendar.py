from datetime import datetime, timedelta
from unittest.mock import Mock
import types

import pytest
from app.api import api_calendar
from app.api.v1 import api_service_provider
from app.models import (
    Booking,
    BookingStatus,
    CalendarAccount,
    CalendarProvider,
    User,
    UserType,
)
from app.models.base import BaseModel
from app.services import calendar_service
from fastapi import HTTPException
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.tests.google_mocks import DummyFlow, google_dummy_flow  # noqa: F401


@pytest.fixture(autouse=True)
def patch_calendar(monkeypatch):
    """Disable credential checks and avoid network calls."""

    monkeypatch.setattr(calendar_service, "require_credentials", lambda: None)

    store: dict[str, str] = {}

    class DummyRedis:
        def setex(self, key, ttl, value):
            store[key] = value

        def get(self, key):
            return store.get(key)

        def delete(self, key):
            store.pop(key, None)

    dummy_redis = DummyRedis()

    monkeypatch.setattr(
        calendar_service,
        "get_redis_client",
        lambda: dummy_redis,
        raising=False,
    )

    def dummy_build(api, version, credentials=None):
        if api == "oauth2":
            return Mock(
                userinfo=lambda: Mock(
                    get=lambda: Mock(execute=lambda: {"email": "e@example.com"})
                )
            )
        return Mock(
            events=lambda: Mock(list=lambda **k: Mock(execute=lambda: {"items": []}))
        )

    monkeypatch.setattr(calendar_service, "build", dummy_build)


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_exchange_code_saves_tokens(monkeypatch, google_dummy_flow):
    db = setup_db()
    user = User(
        email="g@test.com",
        password="x",
        first_name="G",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # google_dummy_flow fixture patches _flow and calendar_service.build

    calendar_service.exchange_code(user.id, "code", "uri", db)

    acc = db.query(CalendarAccount).filter(CalendarAccount.user_id == user.id).first()
    assert acc.refresh_token == "rt"


def test_exchange_code_missing_refresh_token(monkeypatch):
    db = setup_db()
    user = User(
        email="nrt@test.com",
        password="x",
        first_name="No",
        last_name="Token",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    monkeypatch.setattr(
        calendar_service,
        "_flow",
        lambda uri, flow_cls=calendar_service.Flow: DummyFlow(refresh_token=None),
    )

    with pytest.raises(HTTPException) as exc:
        calendar_service.exchange_code(user.id, "code", "uri", db)
    assert exc.value.status_code == 400


def test_get_auth_url_missing_credentials(monkeypatch):
    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_ID", "", raising=False
    )
    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_SECRET", "", raising=False
    )

    url = calendar_service.get_auth_url(1, "http://localhost")
    assert url.startswith("http")


def test_exchange_code_missing_credentials(monkeypatch, google_dummy_flow):
    db = setup_db()
    user = User(
        email="mc@test.com",
        password="x",
        first_name="Miss",
        last_name="Cred",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_ID", "", raising=False
    )
    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_SECRET", "", raising=False
    )

    calendar_service.exchange_code(user.id, "code", "uri", db)


def test_fetch_events_http_error(monkeypatch):
    db = setup_db()
    user = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="U",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    acc = CalendarAccount(
        user_id=user.id,
        provider=CalendarProvider.GOOGLE,
        refresh_token="r",
        access_token="a",
        token_expiry=datetime.utcnow(),
    )
    db.add(acc)
    db.commit()

    def raise_error(*args, **kwargs):
        raise HttpError(resp=Mock(status=500), content=b"")

    monkeypatch.setattr(
        calendar_service,
        "build",
        lambda *a, **k: Mock(events=lambda: Mock(list=raise_error)),
    )
    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_ID", "id", raising=False
    )
    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_SECRET", "sec", raising=False
    )

    events = calendar_service.fetch_events(
        user.id, datetime.utcnow(), datetime.utcnow() + timedelta(days=1), db
    )
    # On API error, fetch_events should log and return an empty list,
    # without deleting the CalendarAccount or raising.
    assert events == []
    assert db.query(CalendarAccount).count() == 1


def test_fetch_events_refresh_error(monkeypatch):
    db = setup_db()
    user = User(
        email="refresh@test.com",
        password="x",
        first_name="R",
        last_name="U",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    acc = CalendarAccount(
        user_id=user.id,
        provider=CalendarProvider.GOOGLE,
        refresh_token="r",
        access_token="a",
        token_expiry=datetime.utcnow(),
    )
    db.add(acc)
    db.commit()

    class DummyCred:
        def __init__(self, **kwargs):
            self.expired = True

        def refresh(self, request):
            raise RefreshError("invalid_request")

    monkeypatch.setattr(calendar_service, "Credentials", lambda **kw: DummyCred())
    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_ID", "id", raising=False
    )
    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_SECRET", "sec", raising=False
    )

    events = calendar_service.fetch_events(
        user.id, datetime.utcnow(), datetime.utcnow() + timedelta(days=1), db
    )
    # On refresh error, fetch_events should not raise or delete the account;
    # it should return an empty list and mark the account as needing reauth.
    assert events == []
    acc_after = db.query(CalendarAccount).one()
    assert acc_after.status == "needs_reauth"


def test_fetch_events_missing_credentials(monkeypatch):
    db = setup_db()
    user = User(
        email="nocred@test.com",
        password="x",
        first_name="No",
        last_name="Cred",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    acc = CalendarAccount(
        user_id=user.id,
        provider=CalendarProvider.GOOGLE,
        refresh_token="r",
        access_token="a",
        token_expiry=datetime.utcnow(),
    )
    db.add(acc)
    db.commit()

    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_ID", "", raising=False
    )
    monkeypatch.setattr(
        calendar_service.settings, "GOOGLE_CLIENT_SECRET", "", raising=False
    )

    events = calendar_service.fetch_events(
        user.id,
        datetime.utcnow(),
        datetime.utcnow() + timedelta(days=1),
        db,
    )
    assert events == []


def test_unavailable_dates_include_calendar(monkeypatch):
    db = setup_db()
    user = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="A",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    booking = Booking(
        artist_id=user.id,
        client_id=1,
        service_id=1,
        start_time=datetime(2025, 1, 1, 12, 0),
        end_time=datetime(2025, 1, 1, 13, 0),
        status=BookingStatus.CONFIRMED,
        total_price=10,
    )
    db.add(booking)
    db.commit()

    monkeypatch.setattr(
        calendar_service,
        "fetch_events",
        lambda uid, s, e, d: [datetime(2025, 1, 2, 10, 0)],
    )

    resp = api_service_provider.read_artist_availability(user.id, db=db)
    assert resp["unavailable_dates"] == ["2025-01-01", "2025-01-02"]


def test_flow_includes_openid_scope(monkeypatch):
    captured = {}

    def dummy_from_client_config(config, scopes=None, redirect_uri=None):
        captured["scopes"] = scopes

        class FlowWithAuth(DummyFlow):
            def authorization_url(self, *args, **kwargs):
                captured["auth_kwargs"] = kwargs
                return "http://auth", None

        return FlowWithAuth()

    monkeypatch.setattr(
        calendar_service.Flow, "from_client_config", dummy_from_client_config
    )
    calendar_service.get_auth_url(1, "http://localhost")
    assert "openid" in captured["scopes"]
    assert captured["auth_kwargs"]["prompt"] == "consent"


def test_calendar_status_endpoint():
    db = setup_db()
    user = User(
        email="status@test.com",
        password="x",
        first_name="Status",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Initially not connected
    result = api_calendar.google_calendar_status(db, user)
    assert result == {"connected": False}

    acc = CalendarAccount(
        user_id=user.id,
        provider=CalendarProvider.GOOGLE,
        refresh_token="r",
        access_token="a",
        token_expiry=datetime.utcnow(),
    )
    db.add(acc)
    db.commit()

    result2 = api_calendar.google_calendar_status(db, user)
    assert result2 == {"connected": True, "email": None}


def test_callback_success(monkeypatch):
    db = setup_db()
    user = User(
        email="cb@test.com",
        password="x",
        first_name="Call",
        last_name="Back",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    called = {}

    def dummy_exchange(uid, code, uri, session):
        called["uid"] = uid

    monkeypatch.setattr(calendar_service, "exchange_code", dummy_exchange)
    monkeypatch.setattr(
        api_calendar.settings, "FRONTEND_URL", "http://frontend", raising=False
    )

    request = types.SimpleNamespace(
        url_for=lambda name: "https://api.example.com/api/v1/google-calendar/callback"
    )

    resp = api_calendar.google_calendar_callback(
        request=request,
        code="code",
        state=str(user.id),
        db=db,
    )
    assert (
        resp.headers["location"]
        == "http://frontend/dashboard/profile/edit?calendarSync=success"
    )
    assert called["uid"] == user.id


def test_callback_error(monkeypatch):
    db = setup_db()
    user = User(
        email="err@test.com",
        password="x",
        first_name="Err",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    def raise_exc(*a, **k):
        raise RuntimeError("boom")

    monkeypatch.setattr(calendar_service, "exchange_code", raise_exc)
    mock_logger = Mock()
    monkeypatch.setattr(api_calendar, "logger", mock_logger)
    monkeypatch.setattr(
        api_calendar.settings, "FRONTEND_URL", "http://frontend", raising=False
    )

    request = types.SimpleNamespace(
        url_for=lambda name: "https://api.example.com/api/v1/google-calendar/callback"
    )

    resp = api_calendar.google_calendar_callback(
        request=request,
        code="c",
        state=str(user.id),
        db=db,
    )
    assert (
        resp.headers["location"]
        == "http://frontend/dashboard/profile/edit?calendarSync=error"
    )
    mock_logger.error.assert_called()


def test_callback_with_random_state(monkeypatch):
    db = setup_db()
    user = User(
        email="rand@test.com",
        password="x",
        first_name="Rand",
        last_name="State",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    dummy_called = {}

    def dummy_exchange(uid, code, uri, session):
        dummy_called["uid"] = uid

    monkeypatch.setattr(calendar_service, "exchange_code", dummy_exchange)
    monkeypatch.setattr(
        api_calendar.settings, "FRONTEND_URL", "http://frontend", raising=False
    )

    state_token = "state-token"

    def resolver(token):
        value = user.id if token == state_token else None
        dummy_called.setdefault("resolver_calls", []).append((token, value))
        return value

    monkeypatch.setattr(
        calendar_service,
        "resolve_calendar_state",
        resolver,
    )
    monkeypatch.setattr(
        api_calendar.calendar_service,
        "resolve_calendar_state",
        resolver,
    )

    assert api_calendar.calendar_service.resolve_calendar_state(state_token) == user.id

    request = types.SimpleNamespace(
        url_for=lambda name: "https://api.example.com/api/v1/google-calendar/callback"
    )

    resp = api_calendar.google_calendar_callback(
        request=request,
        code="code",
        state=state_token,
        db=db,
    )
    assert (
        resp.headers["location"]
        == "http://frontend/dashboard/profile/edit?calendarSync=success"
    )
    assert dummy_called["uid"] == user.id


def test_resolve_calendar_state_uses_redis(monkeypatch):
    state_token = "redis-token"
    redis_client = calendar_service.get_redis_client()
    redis_client.setex("oauth:calendar:state:" + state_token, 600, "42")
    assert calendar_service.resolve_calendar_state(state_token) == 42
    # Second call should fall back to int conversion (state already popped)
    assert calendar_service.resolve_calendar_state("99") == 99
