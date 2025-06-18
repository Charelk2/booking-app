from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from decimal import Decimal

from app.main import app
from app.models import (
    User,
    UserType,
    BookingRequest,
    QuoteV2,
    QuoteStatusV2,
    BookingSimple,
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
        user_type=UserType.ARTIST,
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
        deposit_amount=0,
        deposit_paid=False,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    # return objects still bound to the session so dependency overrides work
    return client, br.id, Session


def override_client(user):
    def _override():
        return user

    return _override


def test_create_deposit(monkeypatch):
    Session = setup_app()
    client_user, br_id, Session = create_records(Session)
    prev_db = app.dependency_overrides.get(get_db)
    prev_client = app.dependency_overrides.get(get_current_active_client)
    app.dependency_overrides[get_current_active_client] = override_client(
        client_user
    )

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
    app.dependency_overrides[get_current_active_client] = override_client(
        other_client
    )

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
