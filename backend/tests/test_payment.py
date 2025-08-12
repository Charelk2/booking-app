from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from decimal import Decimal
import httpx

from app.main import app
from app.models import (
    User,
    UserType,
    BookingRequest,
    QuoteV2,
    QuoteStatusV2,
    BookingSimple,
    Message,
    MessageType,
    VisibleTo,
    MessageAction,
    BookingStatus,
)
from app.models.base import BaseModel
from app.api.dependencies import get_db, get_current_active_client
import app.api.api_payment as api_payment


def setup_app():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
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


def create_records(Session, deposit_amount=0):
    db = Session()
    client = User(
        email="client@test.com",
        password="x",
        first_name="c",
        last_name="l",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artist@test.com",
        password="x",
        first_name="a",
        last_name="r",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(client_id=client.id, artist_id=artist.id)
    db.add(br)
    db.commit()
    db.refresh(br)

    quote = QuoteV2(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[],
        sound_fee=0,
        travel_fee=0,
        subtotal=Decimal("100"),
        total=Decimal("100"),
        status=QuoteStatusV2.ACCEPTED,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    booking = BookingSimple(
        quote_id=quote.id,
        artist_id=artist.id,
        client_id=client.id,
        confirmed=True,
        payment_status="pending",
        deposit_amount=deposit_amount,
        deposit_paid=False,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    # return objects still bound to the session so dependency overrides work
    return client, br.id, Session


def override_client(user):
    dummy = type("Dummy", (), {"id": user.id, "user_type": user.user_type})()

    def _override():
        return dummy

    return _override


def test_create_deposit(monkeypatch):
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    def fake_post(url, json, timeout=10):
        class Resp:
            status_code = 201

            def raise_for_status(self):
                pass

            def json(self):
                return {"id": "ch_test", "status": "succeeded"}

        return Resp()

    monkeypatch.setattr(api_payment.httpx, "post", fake_post)
    client = TestClient(app)
    res = client.post(
        "/api/v1/payments/", json={"booking_request_id": br_id, "amount": 50}
    )
    assert res.status_code == 201
    db = Session()
    booking = db.query(BookingSimple).first()
    assert booking.deposit_amount == Decimal("50")
    assert booking.deposit_paid is True
    assert booking.payment_status == "deposit_paid"
    assert booking.payment_id == "ch_test"
    db.close()
    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_create_deposit_fake(monkeypatch):
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    def should_not_call(*args, **kwargs):
        raise AssertionError("httpx.post should not be called")

    monkeypatch.setattr(api_payment.httpx, "post", should_not_call)
    monkeypatch.setattr(api_payment, "PAYMENT_GATEWAY_FAKE", "1")
    client = TestClient(app)
    res = client.post(
        "/api/v1/payments/", json={"booking_request_id": br_id, "amount": 50}
    )
    assert res.status_code == 201
    db = Session()
    booking = db.query(BookingSimple).first()
    assert booking.deposit_amount == Decimal("50")
    assert booking.deposit_paid is True
    assert booking.payment_status == "deposit_paid"
    assert booking.payment_id.startswith("fake_")
    db.close()
    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_create_deposit_default_amount(monkeypatch):
    Session = setup_app()
    client_user, br_id, Session = create_records(Session, deposit_amount=Decimal("40"))
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    def fake_post(url, json, timeout=10):
        class Resp:
            status_code = 201

            def raise_for_status(self):
                pass

            def json(self):
                return {"id": "ch_test", "status": "succeeded"}

        return Resp()

    monkeypatch.setattr(api_payment.httpx, "post", fake_post)
    client = TestClient(app)
    res = client.post("/api/v1/payments/", json={"booking_request_id": br_id})
    assert res.status_code == 201
    db = Session()
    booking = db.query(BookingSimple).first()
    assert booking.deposit_amount == Decimal("40")
    assert booking.deposit_paid is True
    assert booking.payment_status == "deposit_paid"
    assert booking.payment_id == "ch_test"
    db.close()
    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_get_receipt(tmp_path):
    payment_id = "abc123"
    receipts_dir = tmp_path / "static" / "receipts"
    receipts_dir.mkdir(parents=True)
    pdf_path = receipts_dir / f"{payment_id}.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test receipt\n%%EOF")

    prev_dir = api_payment.RECEIPT_DIR
    api_payment.RECEIPT_DIR = str(receipts_dir)

    client = TestClient(app)
    res = client.get(f"/api/v1/payments/{payment_id}/receipt")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF")

    api_payment.RECEIPT_DIR = prev_dir


def test_payment_wrong_client_forbidden(monkeypatch):
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    db = Session()
    other_client = User(
        email="other@test.com",
        password="y",
        first_name="o",
        last_name="c",
        user_type=UserType.CLIENT,
    )
    db.add(other_client)
    db.commit()
    db.refresh(other_client)
    db.close()

    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(other_client)

    def fake_post(url, json, timeout=10):
        class Resp:
            status_code = 201

            def raise_for_status(self):
                pass

            def json(self):
                return {"id": "ch_test", "status": "succeeded"}

        return Resp()

    monkeypatch.setattr(api_payment.httpx, "post", fake_post)
    client = TestClient(app)
    res = client.post(
        "/api/v1/payments/", json={"booking_request_id": br_id, "amount": 50}
    )
    assert res.status_code == 403
    db = Session()
    booking = db.query(BookingSimple).first()
    assert booking.deposit_paid is False
    db.close()
    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_full_payment_preserves_deposit(monkeypatch):
    """Paying the full amount should not overwrite the deposit amount."""
    Session = setup_app()
    client_user, br_id, Session = create_records(Session, deposit_amount=Decimal("40"))
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    def fake_post(url, json, timeout=10):
        class Resp:
            status_code = 201

            def raise_for_status(self):
                pass

            def json(self):
                return {"id": "ch_full", "status": "succeeded"}

        return Resp()

    monkeypatch.setattr(api_payment.httpx, "post", fake_post)
    client = TestClient(app)
    res = client.post(
        "/api/v1/payments/",
        json={"booking_request_id": br_id, "amount": 100, "full": True},
    )
    assert res.status_code == 201
    db = Session()
    booking = db.query(BookingSimple).first()
    assert booking.deposit_amount == Decimal("40")
    assert booking.deposit_paid is True
    assert booking.payment_status == "paid"
    assert booking.payment_id == "ch_full"
    db.close()
    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_duplicate_payment_rejected(monkeypatch):
    """Second payment attempt for same booking should be rejected."""
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    calls = []

    def fake_post(url, json, timeout=10):
        calls.append(1)

        class Resp:
            status_code = 201

            def raise_for_status(self):
                pass

            def json(self):
                return {"id": "ch_first", "status": "succeeded"}

        return Resp()

    monkeypatch.setattr(api_payment.httpx, "post", fake_post)
    client = TestClient(app)

    res = client.post(
        "/api/v1/payments/",
        json={"booking_request_id": br_id, "amount": 50},
    )
    assert res.status_code == 201

    res = client.post(
        "/api/v1/payments/",
        json={"booking_request_id": br_id, "amount": 50},
    )
    assert res.status_code == 400
    assert len(calls) == 1

    db = Session()
    booking = db.query(BookingSimple).first()
    assert booking.deposit_paid is True
    db.close()
    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_payment_gateway_error(monkeypatch):
    """Return 502 when the payment gateway request fails."""
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    def raise_error(*args, **kwargs):
        raise httpx.RequestError("boom")

    monkeypatch.setattr(api_payment.httpx, "post", raise_error)
    client = TestClient(app)
    res = client.post(
        "/api/v1/payments/",
        json={"booking_request_id": br_id, "amount": 50},
    )
    assert res.status_code == 502

    db = Session()
    booking = db.query(BookingSimple).first()
    assert booking.deposit_paid is False
    db.close()

    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_payment_confirms_booking_and_creates_messages(monkeypatch):
    """Successful payment confirms booking and posts system messages."""
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    def fake_post(url, json, timeout=10):
        class Resp:
            status_code = 201

            def raise_for_status(self):
                pass

            def json(self):
                return {"id": "ch_test", "status": "succeeded"}

        return Resp()

    monkeypatch.setattr(api_payment.httpx, "post", fake_post)
    client = TestClient(app)
    res = client.post(
        "/api/v1/payments/",
        json={"booking_request_id": br_id, "amount": 50},
    )
    assert res.status_code == 201

    db = Session()
    booking = db.query(BookingSimple).first()
    br = db.query(BookingRequest).first()
    assert booking.confirmed is True
    assert br.status == BookingStatus.REQUEST_CONFIRMED
    msgs = db.query(Message).all()
    assert len(msgs) == 2
    assert {m.visible_to for m in msgs} == {VisibleTo.CLIENT, VisibleTo.ARTIST}
    for m in msgs:
        assert m.message_type == MessageType.SYSTEM
        assert m.action == MessageAction.VIEW_BOOKING_DETAILS
    db.close()

    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_payment_triggers_sound_outreach(monkeypatch):
    """Payment should initiate sound supplier outreach when required."""
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    db = Session()
    br = db.query(BookingRequest).filter(BookingRequest.id == br_id).first()
    br.travel_breakdown = {
        "sound_required": True,
        "event_city": "Pretoria",
        "selected_sound_service_id": 42,
    }
    db.add(br)
    db.commit()
    db.close()

    called = {}

    def fake_kickoff(
        booking_id,
        *,
        event_city,
        request_timeout_hours,
        mode,
        selected_service_id,
        db,
        current_artist,
    ):
        called["booking_id"] = booking_id
        called["event_city"] = event_city
        called["selected_service_id"] = selected_service_id
        return {"status": "ok"}

    monkeypatch.setattr(api_payment, "kickoff_sound_outreach", fake_kickoff)

    def fake_post(url, json, timeout=10):
        class Resp:
            status_code = 201

            def raise_for_status(self):
                pass

            def json(self):
                return {"id": "ch_test", "status": "succeeded"}

        return Resp()

    monkeypatch.setattr(api_payment.httpx, "post", fake_post)
    client = TestClient(app)
    res = client.post(
        "/api/v1/payments/",
        json={"booking_request_id": br_id, "amount": 50},
    )
    assert res.status_code == 201
    assert called["event_city"] == "Pretoria"
    assert called["selected_service_id"] == 42

    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)
