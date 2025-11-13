import os
import sys
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from decimal import Decimal
import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

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


def create_records(Session):
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


def test_create_payment_inline_returns_backend_amount():
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)

    client = TestClient(app)
    res = client.post(
        "/api/v1/payments/",
        json={"booking_request_id": br_id, "inline": True},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "inline"
    assert body["currency"].upper() == "ZAR"
    # Quote total is 100; client fee 3 and VAT on fee 0.45 → 103.45
    assert body["amount"] == pytest.approx(103.45, rel=1e-6)

    db = Session()
    booking = db.query(BookingSimple).first()
    assert str(booking.payment_status or "").lower() == "pending"
    assert booking.charged_total_amount in (None, 0)
    assert booking.payment_id == body["reference"]
    db.close()

    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)


def test_paystack_verify_sets_charged_total_amount(monkeypatch):
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(client_user)
    monkeypatch.setattr(api_payment.settings, "PAYSTACK_SECRET_KEY", "sk_test")

    client = TestClient(app)
    init_res = client.post(
        "/api/v1/payments/",
        json={"booking_request_id": br_id, "inline": True},
    )
    reference = init_res.json()["reference"]

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, headers=None):
            class Resp:
                def raise_for_status(self):
                    return None

                def json(self):
                    return {"data": {"status": "success", "amount": 555000}}

            return Resp()

    monkeypatch.setattr(api_payment.httpx, "Client", FakeClient)

    res = client.get(f"/api/v1/payments/paystack/verify?reference={reference}")
    assert res.status_code == 200
    body = res.json()
    assert body["payment_id"] == reference
    # Paystack amount 555000 kobo => 5550.00 major units
    assert body["amount"] == pytest.approx(5550.0, rel=1e-6)
    assert body["currency"].upper() == "ZAR"

    db = Session()
    booking = db.query(BookingSimple).first()
    assert booking.payment_status == "paid"
    assert Decimal(booking.charged_total_amount or 0) == Decimal("5550")
    total_to_pay, _, _ = api_payment._derive_receipt_amounts(booking, booking.quote)
    assert total_to_pay == pytest.approx(5550.0, rel=1e-6)
    db.close()

    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_client is not None:
        app.dependency_overrides[get_current_active_client] = prev_client
    else:
        app.dependency_overrides.pop(get_current_active_client, None)
