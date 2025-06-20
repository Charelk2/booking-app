from datetime import datetime, timedelta
from unittest.mock import Mock

from google.oauth2.credentials import Credentials

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException
from googleapiclient.errors import HttpError

from app.models import (
    User,
    UserType,
    CalendarAccount,
    CalendarProvider,
    Booking,
    BookingStatus,
)
from app.models.base import BaseModel
from app.api.v1 import api_artist
from app.api import api_calendar
from app.services import calendar_service


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_exchange_code_saves_tokens(monkeypatch):
    db = setup_db()
    user = User(email='g@test.com', password='x', first_name='G', last_name='User', user_type=UserType.ARTIST)
    db.add(user)
    db.commit()
    db.refresh(user)

    class DummyFlow:
        def __init__(self):
            self.credentials = Credentials(
                token='at',
                refresh_token='rt',
                token_uri='u',
                client_id='id',
                client_secret='sec',
            )
            self.credentials.expiry = datetime.utcnow()

        def fetch_token(self, code):
            pass

    monkeypatch.setattr(calendar_service, '_flow', lambda uri: DummyFlow())
    monkeypatch.setattr(
        calendar_service,
        'build',
        lambda *a, **k: Mock(userinfo=lambda: Mock(get=lambda: Mock(execute=lambda: {'email': 'e@example.com'}))),
    )

    calendar_service.exchange_code(user.id, 'code', 'uri', db)

    acc = db.query(CalendarAccount).filter(CalendarAccount.user_id == user.id).first()
    assert acc.refresh_token == 'rt'


def test_exchange_code_missing_refresh_token(monkeypatch):
    db = setup_db()
    user = User(email='nrt@test.com', password='x', first_name='No', last_name='Token', user_type=UserType.ARTIST)
    db.add(user)
    db.commit()
    db.refresh(user)

    class DummyFlow:
        def __init__(self):
            self.credentials = Credentials(
                token='at',
                refresh_token=None,
                token_uri='u',
                client_id='id',
                client_secret='sec',
            )
            self.credentials.expiry = datetime.utcnow()

        def fetch_token(self, code):
            pass

    monkeypatch.setattr(calendar_service, '_flow', lambda uri: DummyFlow())

    with pytest.raises(HTTPException) as exc:
        calendar_service.exchange_code(user.id, 'code', 'uri', db)
    assert exc.value.status_code == 400


def test_fetch_events_http_error(monkeypatch):
    db = setup_db()
    user = User(email='c@test.com', password='x', first_name='C', last_name='U', user_type=UserType.ARTIST)
    db.add(user)
    db.commit()
    db.refresh(user)
    acc = CalendarAccount(
        user_id=user.id,
        provider=CalendarProvider.GOOGLE,
        refresh_token='r',
        access_token='a',
        token_expiry=datetime.utcnow(),
    )
    db.add(acc)
    db.commit()

    def raise_error(*args, **kwargs):
        raise HttpError(resp=Mock(status=500), content=b'')

    monkeypatch.setattr(calendar_service, 'build', lambda *a, **k: Mock(events=lambda: Mock(list=raise_error)))

    with pytest.raises(HTTPException) as exc:
        calendar_service.fetch_events(user.id, datetime.utcnow(), datetime.utcnow() + timedelta(days=1), db)
    assert exc.value.status_code == 502


def test_unavailable_dates_include_calendar(monkeypatch):
    db = setup_db()
    user = User(email='a@test.com', password='x', first_name='A', last_name='A', user_type=UserType.ARTIST)
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
        'fetch_events',
        lambda uid, s, e, d: [datetime(2025, 1, 2, 10, 0)],
    )

    resp = api_artist.read_artist_availability(user.id, db)
    assert resp['unavailable_dates'] == ['2025-01-01', '2025-01-02']


def test_flow_includes_openid_scope(monkeypatch):
    captured = {}

    def dummy_from_client_config(config, scopes=None, redirect_uri=None):
        captured['scopes'] = scopes

        class DummyFlow:
            def authorization_url(self, *args, **kwargs):
                captured['auth_kwargs'] = kwargs
                return 'http://auth', None

        return DummyFlow()

    monkeypatch.setattr(calendar_service.Flow, 'from_client_config', dummy_from_client_config)
    calendar_service.get_auth_url(1, 'http://localhost')
    assert 'openid' in captured['scopes']
    assert captured['auth_kwargs']['prompt'] == 'consent'


def test_calendar_status_endpoint():
    db = setup_db()
    user = User(
        email='status@test.com',
        password='x',
        first_name='Status',
        last_name='User',
        user_type=UserType.ARTIST,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Initially not connected
    result = api_calendar.google_calendar_status(db, user)
    assert result == {'connected': False}

    acc = CalendarAccount(
        user_id=user.id,
        provider=CalendarProvider.GOOGLE,
        refresh_token='r',
        access_token='a',
        token_expiry=datetime.utcnow(),
    )
    db.add(acc)
    db.commit()

    result2 = api_calendar.google_calendar_status(db, user)
    assert result2 == {'connected': True, 'email': None}


def test_callback_success(monkeypatch):
    db = setup_db()
    user = User(
        email='cb@test.com',
        password='x',
        first_name='Call',
        last_name='Back',
        user_type=UserType.ARTIST,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    called = {}

    def dummy_exchange(uid, code, uri, session):
        called['uid'] = uid

    monkeypatch.setattr(calendar_service, 'exchange_code', dummy_exchange)
    monkeypatch.setattr(api_calendar.settings, 'FRONTEND_URL', 'http://frontend', raising=False)

    resp = api_calendar.google_calendar_callback('code', str(user.id), db)
    assert resp.headers['location'] == 'http://frontend/dashboard/profile/edit?calendarSync=success'
    assert called['uid'] == user.id


def test_callback_error(monkeypatch):
    db = setup_db()
    user = User(email='err@test.com', password='x', first_name='Err', last_name='User', user_type=UserType.ARTIST)
    db.add(user)
    db.commit()
    db.refresh(user)

    def raise_exc(*a, **k):
        raise RuntimeError('boom')

    monkeypatch.setattr(calendar_service, 'exchange_code', raise_exc)
    mock_logger = Mock()
    monkeypatch.setattr(api_calendar, 'logger', mock_logger)
    monkeypatch.setattr(api_calendar.settings, 'FRONTEND_URL', 'http://frontend', raising=False)

    resp = api_calendar.google_calendar_callback('c', str(user.id), db)
    assert resp.headers['location'] == 'http://frontend/dashboard/profile/edit?calendarSync=error'
    mock_logger.error.assert_called()

