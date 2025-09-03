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
)
from app.models.base import BaseModel
from app.api.dependencies import get_db, get_current_user
from app.crud import crud_quote_v2


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

    crud_quote_v2.accept_quote(db=db, quote_id=quote.id)

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

