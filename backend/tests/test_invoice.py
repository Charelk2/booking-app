from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from decimal import Decimal
import datetime

from app.main import app
from app.models import (
    User,
    UserType,
    BookingRequest,
    Service,
    QuoteV2,
    QuoteStatusV2,
    BookingSimple,
    Invoice,
    Booking,
)
from app.models.base import BaseModel
from app.api.dependencies import get_db, get_current_user
from app.crud import crud_quote


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
    client = User(email="c@test.com", password="x", first_name="C", last_name="L", user_type=UserType.CLIENT)
    artist = User(email="a@test.com", password="x", first_name="A", last_name="R", user_type=UserType.SERVICE_PROVIDER)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    service = Service(
        artist_id=artist.id,
        title="Show",
        price=Decimal("100"),
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    br = BookingRequest(client_id=client.id, artist_id=artist.id, service_id=service.id, proposed_datetime_1=datetime.datetime.utcnow())
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
        status=QuoteStatusV2.PENDING,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    return db, client, artist, quote


def override_user(user):
    def _override():
        return user

    return _override


def test_invoice_created_and_api():
    Session = setup_app()
    db, client_user, artist_user, quote = create_records(Session)

    crud_quote.accept_quote(db=db, quote_id=quote.id)

    invoice = db.query(Invoice).first()
    assert invoice is not None
    assert invoice.amount_due == Decimal("100")

    prev_db = app.dependency_overrides.get(get_db)
    prev_user = app.dependency_overrides.get(get_current_user)

    def _db_override():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_user] = override_user(client_user)
    client = TestClient(app)

    res = client.get(f"/api/v1/invoices/{invoice.id}")
    assert res.status_code == 200
    assert res.json()["id"] == invoice.id
    # invoice_type present (string), best-effort
    assert "invoice_type" in res.json()

    res = client.post(f"/api/v1/invoices/{invoice.id}/mark-paid", json={"payment_method": "eft"})
    assert res.status_code == 200
    assert res.json()["status"] == "paid"

    res = client.get(f"/api/v1/invoices/{invoice.id}/pdf")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"

    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_user is not None:
        app.dependency_overrides[get_current_user] = prev_user
    else:
        app.dependency_overrides.pop(get_current_user, None)
    db.close()


def test_invoice_idempotency_by_type():
    Session = setup_app()
    db, client_user, artist_user, quote = create_records(Session)
    # Accept quote to create a BookingSimple row
    from app.crud import crud_quote as _cq
    bs = _cq.accept_quote(db=db, quote_id=quote.id)
    assert bs is not None
    # Create client fee invoice twice → expect one record
    from app.crud import crud_invoice as inv
    inv1 = inv.create_client_fee_invoice(db, bs)
    inv2 = inv.create_client_fee_invoice(db, bs)
    assert inv1.id == inv2.id
    # Create commission invoice twice → expect one record
    com1 = inv.create_commission_invoice(db, bs)
    com2 = inv.create_commission_invoice(db, bs)
    assert com1.id == com2.id
    db.close()


def test_invoice_by_booking_provider_and_client_fee():
    Session = setup_app()
    db, client_user, artist_user, quote = create_records(Session)

    # Accept quote to create Booking + BookingSimple
    from app.crud import crud_quote as _cq
    bs = _cq.accept_quote(db=db, quote_id=quote.id)
    assert bs is not None

    # Create provider and client-fee invoices for this booking_simple
    from app.crud import crud_invoice as inv
    provider = inv.create_provider_invoice(db, bs, vendor=True)
    client_fee = inv.create_client_fee_invoice(db, bs)

    booking = db.query(Booking).filter(Booking.quote_id == quote.id).first()
    assert booking is not None

    prev_db = app.dependency_overrides.get(get_db)
    prev_user = app.dependency_overrides.get(get_current_user)

    def _db_override():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_user] = override_user(client_user)
    client = TestClient(app)

    # Provider invoice by formal booking id
    res = client.get(f"/api/v1/invoices/by-booking/{booking.id}?type=provider")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == provider.id
    assert data["booking_id"] == booking.id
    assert data["booking_simple_id"] == bs.id
    assert data["invoice_type"] in ("provider_tax", "provider_invoice")

    # Client-fee (Booka tax) invoice by formal booking id
    res = client.get(f"/api/v1/invoices/by-booking/{booking.id}?type=client_fee")
    assert res.status_code == 200
    data2 = res.json()
    assert data2["id"] == client_fee.id
    assert data2["booking_id"] == booking.id
    assert data2["booking_simple_id"] == bs.id
    assert data2["invoice_type"] == "client_fee_tax"

    # No commission invoice yet → 404
    res = client.get(f"/api/v1/invoices/by-booking/{booking.id}?type=commission")
    assert res.status_code == 404

    if prev_db is not None:
        app.dependency_overrides[get_db] = prev_db
    else:
        app.dependency_overrides.pop(get_db, None)
    if prev_user is not None:
        app.dependency_overrides[get_current_user] = prev_user
    else:
        app.dependency_overrides.pop(get_current_user, None)
    db.close()
