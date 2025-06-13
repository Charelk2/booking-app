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
)
from app.models.base import BaseModel
from fastapi import HTTPException
from app.api import api_quote_v2
from app.schemas.quote_v2 import ServiceItem, QuoteCreate


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_create_and_accept_quote():
    db = setup_db()
    artist = User(email='artist@test.com', password='x', first_name='A', last_name='R', user_type=UserType.ARTIST)
    client = User(email='client@test.com', password='x', first_name='C', last_name='L', user_type=UserType.CLIENT)
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    br = BookingRequest(client_id=client.id, artist_id=artist.id, status=BookingRequestStatus.PENDING_QUOTE)
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description='Performance', price=Decimal('100'))],
        sound_fee=Decimal('20'),
        travel_fee=Decimal('30'),
    )
    quote = api_quote_v2.create_quote(quote_in, db)
    assert quote.subtotal == Decimal('150')
    assert quote.total == Decimal('150')
    msgs = db.query(Message).all()
    assert len(msgs) == 1
    assert msgs[0].quote_id == quote.id

    booking = api_quote_v2.accept_quote(quote.id, db)
    assert booking.quote_id == quote.id
    assert booking.artist_id == artist.id
    assert booking.client_id == client.id
    assert booking.confirmed is True
    assert booking.payment_status == "pending"


def test_read_quote_not_found():
    db = setup_db()
    try:
        api_quote_v2.read_quote(999, db)
    except Exception as exc:
        assert isinstance(exc, HTTPException)
        assert exc.status_code == 404
        assert "Quote 999 not found" in exc.detail
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
    assert exc_info.value.detail == "Internal Server Error"
    messages = [r for r in caplog.records if "Database error accepting quote" in r.getMessage()]
    assert messages and messages[0].exc_info

