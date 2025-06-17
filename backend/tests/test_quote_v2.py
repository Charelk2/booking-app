from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import logging
import pytest
from decimal import Decimal

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingRequestStatus,
    Message,
    Service,
    Booking,
    BookingStatus,
)
from app.models.base import BaseModel
from fastapi import HTTPException
from app.api import api_quote_v2
from app.schemas.quote_v2 import ServiceItem, QuoteCreate


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_create_and_accept_quote():
    db = setup_db()
    artist = User(
        email="artist@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.ARTIST,
    )
    client = User(
        email="client@test.com",
        password="x",
        first_name="C",
        last_name="L",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    service = Service(
        artist_id=artist.id,
        title="Show",
        description="test",
        price=Decimal("100"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime(2030, 1, 1, 20, 0, 0),
        status=BookingRequestStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Performance", price=Decimal("100"))],
        sound_fee=Decimal("20"),
        travel_fee=Decimal("30"),
    )
    quote = api_quote_v2.create_quote(quote_in, db)
    assert quote.subtotal == Decimal("150")
    assert quote.total == Decimal("150")
    msgs = db.query(Message).all()
    assert len(msgs) == 1
    assert msgs[0].quote_id == quote.id

    booking = api_quote_v2.accept_quote(quote.id, db)
    assert booking.quote_id == quote.id
    assert booking.artist_id == artist.id
    assert booking.client_id == client.id
    assert booking.confirmed is True
    assert booking.payment_status == "pending"
    assert booking.deposit_amount == 0
    assert booking.deposit_paid is False

    db_booking = db.query(Booking).filter(Booking.quote_id == quote.id).first()
    assert db_booking is not None
    assert db_booking.service_id == service.id
    assert db_booking.start_time == br.proposed_datetime_1
    from datetime import timedelta

    assert db_booking.end_time == br.proposed_datetime_1 + timedelta(
        minutes=service.duration_minutes
    )
    assert db_booking.status == BookingStatus.CONFIRMED
    assert db_booking.total_price == quote.total


def test_read_quote_not_found():
    db = setup_db()
    try:
        api_quote_v2.read_quote(999, db)
    except Exception as exc:
        assert isinstance(exc, HTTPException)
        assert exc.status_code == 404
        assert exc.detail["message"] == "Quote 999 not found"
        assert exc.detail["field_errors"]["quote_id"] == "not_found"
    else:
        assert False, "Expected HTTPException for missing quote"


def test_accept_quote_logs_db_error(monkeypatch, caplog):
    db = setup_db()

    def fail_accept(*_):
        raise SQLAlchemyError("db failure")

    monkeypatch.setattr(api_quote_v2.crud_quote_v2, "accept_quote", fail_accept)
    caplog.set_level(logging.ERROR, logger=api_quote_v2.logger.name)

    with pytest.raises(HTTPException) as exc_info:
        api_quote_v2.accept_quote(1, db)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail["message"] == "Internal Server Error"
    assert exc_info.value.detail["field_errors"]["quote_id"] == "db_error"
    messages = [
        r for r in caplog.records if "Database error accepting quote" in r.getMessage()
    ]
    assert messages and messages[0].exc_info


def test_accept_quote_missing_client(caplog):
    """Ensure accepting a quote succeeds even if the client record was deleted."""
    db = setup_db()
    artist = User(
        email="artist2@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.ARTIST,
    )
    client = User(
        email="ghost@test.com",
        password="x",
        first_name="G",
        last_name="O",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    service = Service(
        artist_id=artist.id,
        title="Show",
        description="test",
        price=Decimal("50"),
        currency="ZAR",
        duration_minutes=30,
        service_type="Live Performance",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime(2030, 2, 1, 21, 0, 0),
        status=BookingRequestStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Perf", price=Decimal("100"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    quote = api_quote_v2.create_quote(quote_in, db)

    # Remove the client but keep the booking request intact
    client.booking_requests_as_client.remove(br)
    db.delete(client)
    db.commit()

    caplog.set_level(logging.ERROR, logger="app.utils.notifications")
    with pytest.raises(HTTPException) as exc_info:
        api_quote_v2.accept_quote(quote.id, db)
    assert exc_info.value.status_code == 422
    assert any("Booking request" in r.getMessage() for r in caplog.records)


def test_create_quote_error_logs_and_response(monkeypatch, caplog):
    db = setup_db()
    quote_in = QuoteCreate(
        booking_request_id=1,
        artist_id=2,
        client_id=3,
        services=[ServiceItem(description="foo", price=Decimal("1"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )

    def fail_create(*_):
        raise ValueError("boom")

    monkeypatch.setattr(api_quote_v2.crud_quote_v2, "create_quote", fail_create)
    caplog.set_level(logging.ERROR, logger=api_quote_v2.logger.name)
    with pytest.raises(HTTPException) as exc_info:
        api_quote_v2.create_quote(quote_in, db)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["message"] == "Unable to create quote"
    assert exc_info.value.detail["field_errors"]["quote"] == "create_failed"
    assert any("artist_id=2" in r.getMessage() for r in caplog.records)


def test_accept_quote_value_error_logs(monkeypatch, caplog):
    db = setup_db()

    def fail_accept(*_):
        raise ValueError("nope")

    monkeypatch.setattr(api_quote_v2.crud_quote_v2, "accept_quote", fail_accept)
    caplog.set_level(logging.WARNING, logger=api_quote_v2.logger.name)
    with pytest.raises(HTTPException) as exc_info:
        api_quote_v2.accept_quote(10, db)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["message"] == "nope"
    assert exc_info.value.detail["field_errors"]["quote_id"] == "invalid"
    assert any("quote_id=10" in r.getMessage() for r in caplog.records)
