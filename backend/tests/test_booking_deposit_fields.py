import datetime
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.base import BaseModel
from app.models import (
    User,
    UserType,
    Service,
    Booking,
    BookingStatus,
    BookingRequest,
    QuoteV2,
    QuoteStatusV2,
    BookingSimple,
)
from app.api import api_booking


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def create_records(
    db,
    *,
    with_simple: bool = True,
    deposit_amount: Decimal | None = Decimal("50"),
    deposit_due_by: datetime.datetime | None = datetime.datetime(2029, 12, 25),
    payment_status: str | None = "pending",
    deposit_paid: bool | None = False,
):
    client = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="L",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
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

    booking = Booking(
        artist_id=artist.id,
        client_id=client.id,
        service_id=service.id,
        start_time=datetime.datetime(2030, 1, 1, 12, 0),
        end_time=datetime.datetime(2030, 1, 1, 13, 0),
        status=BookingStatus.CONFIRMED,
        total_price=Decimal("100"),
        quote_id=quote.id,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    if with_simple:
        simple = BookingSimple(
            quote_id=quote.id,
            artist_id=artist.id,
            client_id=client.id,
            confirmed=True,
            payment_status=payment_status,
            deposit_amount=deposit_amount,
            deposit_due_by=deposit_due_by,
            deposit_paid=deposit_paid,
        )
        db.add(simple)
        db.commit()
        db.refresh(simple)

    return client, booking, br.id


def test_booking_endpoints_include_deposit_fields():
    db = setup_db()
    client, booking, br_id = create_records(db)

    result = api_booking.read_my_bookings(
        db=db, current_client=client, status_filter=None
    )
    assert result[0].deposit_amount == Decimal("50")
    assert result[0].payment_status == "pending"
    assert result[0].deposit_paid is False
    assert result[0].deposit_due_by == datetime.datetime(2029, 12, 25)
    assert result[0].booking_request_id == br_id

    detail = api_booking.read_booking_details(
        db=db, booking_id=booking.id, current_user=client
    )
    assert detail.deposit_amount == Decimal("50")
    assert detail.payment_status == "pending"
    assert detail.deposit_paid is False
    assert detail.deposit_due_by == datetime.datetime(2029, 12, 25)
    assert detail.booking_request_id == br_id


def test_booking_endpoints_null_fields_when_no_simple():
    db = setup_db()
    client, booking, _ = create_records(db, with_simple=False)

    result = api_booking.read_my_bookings(
        db=db, current_client=client, status_filter=None
    )
    first = result[0]
    assert first.deposit_amount == Decimal("0")
    assert getattr(first, "payment_status", None) is None
    assert getattr(first, "deposit_paid", None) is None
    assert getattr(first, "deposit_due_by", None) is None
    assert getattr(first, "booking_request_id", None) is None

    detail = api_booking.read_booking_details(
        db=db, booking_id=booking.id, current_user=client
    )
    assert detail.deposit_amount == Decimal("0")
    assert getattr(detail, "payment_status", None) is None
    assert getattr(detail, "deposit_paid", None) is None
    assert getattr(detail, "deposit_due_by", None) is None
    assert getattr(detail, "booking_request_id", None) is None


def test_booking_endpoints_null_fields_from_simple():
    db = setup_db()
    client, booking, br_id = create_records(
        db,
        deposit_amount=None,
        deposit_due_by=None,
        payment_status="pending",
        deposit_paid=False,
    )

    result = api_booking.read_my_bookings(
        db=db, current_client=client, status_filter=None
    )
    first = result[0]
    assert first.deposit_amount == Decimal("0")
    assert getattr(first, "deposit_due_by", None) is None
    assert first.payment_status == "pending"
    assert first.deposit_paid is False
    assert first.booking_request_id == br_id

    detail = api_booking.read_booking_details(
        db=db, booking_id=booking.id, current_user=client
    )
    assert detail.deposit_amount == Decimal("0")
    assert getattr(detail, "deposit_due_by", None) is None
    assert detail.payment_status == "pending"
    assert detail.deposit_paid is False
    assert detail.booking_request_id == br_id


