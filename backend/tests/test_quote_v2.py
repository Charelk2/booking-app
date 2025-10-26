from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import logging
import pytest
from decimal import Decimal
from freezegun import freeze_time

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingStatus,
    Message,
    MessageType,
    Service,
    Booking,
)
from app.models.base import BaseModel
from fastapi import HTTPException
from app.api import api_quote_v2
from app import models
from app.crud import crud_notification
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
        user_type=UserType.SERVICE_PROVIDER,
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
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime, timedelta

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime(2030, 1, 1, 20, 0, 0),
        status=BookingStatus.PENDING_QUOTE,
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
    assert len(msgs) == 2
    assert any(m.quote_id == quote.id for m in msgs)

    before = datetime.utcnow()
    booking = api_quote_v2.accept_quote(quote.id, db)
    after = datetime.utcnow()
    assert booking.quote_id == quote.id
    assert booking.artist_id == artist.id
    assert booking.client_id == client.id
    assert booking.confirmed is True
    # Full-upfront flow: booking is pending until paid
    assert booking.payment_status == "pending"

    db_booking = db.query(Booking).filter(Booking.quote_id == quote.id).first()
    assert db_booking is not None
    assert db_booking.service_id == service.id
    assert db_booking.start_time == br.proposed_datetime_1
    assert db_booking.end_time == br.proposed_datetime_1 + timedelta(
        minutes=service.duration_minutes
    )
    assert db_booking.status == BookingStatus.CONFIRMED
    assert db_booking.total_price == quote.total


def test_create_quote_updates_request_status():
    db = setup_db()
    artist = User(
        email="artist_status@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="client_status@test.com",
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
        price=Decimal("50"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime(2035, 1, 1, 20, 0, 0),
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Perf", price=Decimal("50"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    api_quote_v2.create_quote(quote_in, db)
    db.refresh(br)
    assert br.status == BookingStatus.QUOTE_PROVIDED

def test_read_accepted_quote_has_booking_id():
    """GET /quotes/{id} returns booking_id for accepted quotes."""
    db = setup_db()
    artist = User(
        email="artistx@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="clientx@test.com",
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
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime(2040, 1, 1, 20, 0, 0),
        status=BookingStatus.PENDING_QUOTE,
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
    booking_simple = api_quote_v2.accept_quote(quote.id, db)
    db_booking = db.query(Booking).filter(Booking.quote_id == quote.id).first()
    assert db_booking is not None
    result = api_quote_v2.read_quote(quote.id, db)
    assert result.booking_id == db_booking.id


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

    def fail_accept(*_, **__):
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


def test_accept_quote_booking_failure(monkeypatch, caplog):
    """Return 500 when booking creation fails."""
    db = setup_db()

    artist = User(
        email="failbook@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="failbookc@test.com",
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
        price=Decimal("80"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime(2033, 1, 1, 20, 0, 0),
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Performance", price=Decimal("80"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    quote = api_quote_v2.create_quote(quote_in, db)

    def fail_create_booking(*_, **__):
        raise RuntimeError("boom")

    monkeypatch.setattr(
        api_quote_v2.crud_quote_v2,
        "create_booking_from_quote_v2",
        fail_create_booking,
    )
    caplog.set_level(logging.ERROR, logger="app.crud.crud_quote_v2")

    with pytest.raises(HTTPException) as exc_info:
        api_quote_v2.accept_quote(quote.id, db)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail["message"] == "Internal Server Error"
    assert exc_info.value.detail["field_errors"]["booking"] == "create_failed"
    assert any(
        "Failed to create Booking from quote" in r.getMessage() for r in caplog.records
    )


def test_accept_quote_missing_client(caplog):
    """Ensure accepting a quote succeeds even if the client record was deleted."""
    db = setup_db()
    artist = User(
        email="artist2@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
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
        media_url="x",
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
        status=BookingStatus.PENDING_QUOTE,
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
    from app.models import Notification
    for n in db.query(Notification).filter(Notification.user_id == client.id).all():
        db.delete(n)
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

    def fail_accept(*_, **__):
        raise ValueError("nope")

    monkeypatch.setattr(api_quote_v2.crud_quote_v2, "accept_quote", fail_accept)
    caplog.set_level(logging.WARNING, logger=api_quote_v2.logger.name)
    with pytest.raises(HTTPException) as exc_info:
        api_quote_v2.accept_quote(10, db)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["message"] == "nope"
    assert exc_info.value.detail["field_errors"]["quote_id"] == "invalid"
    assert any("quote_id=10" in r.getMessage() for r in caplog.records)


def test_accept_quote_creates_booking_notification():
    db = setup_db()
    artist = User(
        email="artist4@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="client4@test.com",
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
        price=Decimal("200"),
        currency="ZAR",
        duration_minutes=45,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime(2031, 1, 1, 20, 0, 0),
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Performance", price=Decimal("200"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    quote = api_quote_v2.create_quote(quote_in, db)
    api_quote_v2.accept_quote(quote.id, db)

    from app.crud import crud_notification
    from app.models import NotificationType

    notifs = crud_notification.get_notifications_for_user(db, client.id)
    assert len(notifs) == 2
    assert any(n.type == NotificationType.NEW_BOOKING for n in notifs)


def test_accept_quote_booking_notification_link():
    db = setup_db()
    artist = User(
        email="artist5@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="client5@test.com",
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
        price=Decimal("180"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime(2032, 1, 1, 20, 0, 0),
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Performance", price=Decimal("180"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    quote = api_quote_v2.create_quote(quote_in, db)
    booking = api_quote_v2.accept_quote(quote.id, db)

    from app.crud import crud_notification
    from app.models import NotificationType

    notifs = crud_notification.get_notifications_for_user(db, client.id)
    booking_notif = next(n for n in notifs if n.type == NotificationType.NEW_BOOKING)
    from app.models import Booking
    db_booking = db.query(Booking).filter(Booking.quote_id == quote.id).first()
    assert booking_notif.link == f"/dashboard/client/bookings/{db_booking.id}"


def test_accept_quote_supplies_missing_service_id():
    db = setup_db()
    artist = User(
        email="artist7@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="client7@test.com",
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
        price=Decimal("120"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        proposed_datetime_1=datetime(2034, 1, 1, 20, 0, 0),
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Performance", price=Decimal("120"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    quote = api_quote_v2.create_quote(quote_in, db)
    booking = api_quote_v2.accept_quote(quote.id, db, service_id=service.id)

    db.refresh(br)
    assert br.service_id == service.id

    from app.models import Booking

    db_booking = db.query(Booking).filter(Booking.quote_id == quote.id).first()
    assert db_booking is not None
    assert db_booking.service_id == service.id
    assert booking.id == db_booking.id


def test_create_quote_returns_404_for_missing_request():
    """Creating a quote for non-existent booking request should 404."""
    db = setup_db()
    artist = User(
        email="missingreq@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="missingreqc@test.com",
        password="x",
        first_name="C",
        last_name="L",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    quote_in = QuoteCreate(
        booking_request_id=999,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Performance", price=Decimal("50"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )

    with pytest.raises(HTTPException) as exc_info:
        api_quote_v2.create_quote(quote_in, db)

    assert exc_info.value.status_code == 404
    assert (
        exc_info.value.detail["field_errors"]["booking_request_id"]
        == "not_found"
    )


def test_accept_quote_without_date_for_video_service():
    db = setup_db()
    artist = User(
        email="video@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="videoc@test.com",
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
        title="Video",
        description="",
        price=Decimal("100"),
        currency="ZAR",
        duration_minutes=5,
        service_type="Personalized Video",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Video", price=Decimal("100"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    quote = api_quote_v2.create_quote(quote_in, db)
    booking = api_quote_v2.accept_quote(quote.id, db)

    from app.models import Booking

    db_booking = db.query(Booking).filter(Booking.quote_id == quote.id).first()
    assert db_booking is not None
    assert booking.id == db_booking.id
    assert db_booking.start_time is not None


def test_expire_pending_quotes():
    db = setup_db()
    artist = User(
        email="expire@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="expirec@test.com",
        password="x",
        first_name="C",
        last_name="Client",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    service = Service(
        artist_id=artist.id,
        title="Gig",
        description="",
        price=Decimal("100"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime, timedelta

    expired_at = datetime.utcnow() - timedelta(minutes=1)
    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Performance", price=Decimal("100"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
        expires_at=expired_at,
    )
    quote = api_quote_v2.create_quote(quote_in, db)

    from app.crud import crud_quote_v2

    expired = crud_quote_v2.expire_pending_quotes(db)
    assert len(expired) == 1
    db.refresh(quote)
    assert quote.status == models.QuoteStatusV2.EXPIRED


def test_scheduler_posts_system_message():
    db = setup_db()
    artist = User(
        email="artist2@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="client2@test.com",
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
        title="Gig",
        description="",
        price=Decimal("100"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    with freeze_time("2024-01-01"):
        from datetime import datetime, timedelta

        br = BookingRequest(
            client_id=client.id,
            artist_id=artist.id,
            service_id=service.id,
            status=BookingStatus.PENDING_QUOTE,
        )
        db.add(br)
        db.commit()
        db.refresh(br)

        quote_in = QuoteCreate(
            booking_request_id=br.id,
            artist_id=artist.id,
            client_id=client.id,
            services=[ServiceItem(description="Performance", price=Decimal("100"))],
            sound_fee=Decimal("0"),
            travel_fee=Decimal("0"),
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        api_quote_v2.create_quote(quote_in, db)

    from app.crud import crud_quote_v2

    with freeze_time("2024-01-09"):
        expired = crud_quote_v2.expire_pending_quotes(db)

    assert len(expired) == 1
    msgs = (
        db.query(Message)
        .filter(
            Message.booking_request_id == br.id,
            Message.message_type == MessageType.SYSTEM,
        )
        .all()
    )
    assert any(m.content == "Quote expired." for m in msgs)


def test_decline_quote():
    db = setup_db()
    artist = User(
        email="artist_decline@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="client_decline@test.com",
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
        title="Gig",
        description="",
        price=Decimal("100"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[ServiceItem(description="Performance", price=Decimal("100"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    quote = api_quote_v2.create_quote(quote_in, db)
    declined = api_quote_v2.decline_quote(quote.id, db)
    assert declined.status == models.QuoteStatusV2.REJECTED
    msgs = db.query(Message).all()
    assert any(m.content == "Quote declined." for m in msgs)


def test_create_quote_notifies_client_when_ids_missing():
    """Quote creation sends a new message notification using booking request IDs."""
    db = setup_db()

    artist = User(
        email="nartist@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="nclient@test.com",
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
        price=Decimal("50"),
        currency="ZAR",
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteCreate(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=0,  # intentionally incorrect
        services=[ServiceItem(description="Performance", price=Decimal("50"))],
        sound_fee=Decimal("0"),
        travel_fee=Decimal("0"),
    )
    api_quote_v2.create_quote(quote_in, db)

    notifs = crud_notification.get_notifications_for_user(db, client.id)
    assert any(
        n.type == models.NotificationType.NEW_MESSAGE and "Artist sent a quote" in n.message
        for n in notifs
    )
