from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.base import BaseModel
from app.models import Service, BookingRequest, User, UserType
from app.schemas.request_quote import BookingRequestCreate
from app.crud import crud_booking_request
from app.api.api_booking_request import _maybe_create_linked_sound_booking_request


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _create_user(db, *, email: str, user_type: UserType):
    u = User(
        email=email,
        password="x",
        first_name="T",
        last_name="E",
        user_type=user_type,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _create_service(db, *, artist_id: int, title: str, service_type: str):
    s = Service(
        artist_id=artist_id,
        title=title,
        price=Decimal("100.00"),
        duration_minutes=60,
        service_type=service_type,
        media_url="x",
        details={},
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_creates_child_sound_booking_for_external_providers_mode():
    db = setup_db()
    client = _create_user(db, email="client@test.com", user_type=UserType.CLIENT)
    musician = _create_user(
        db, email="musician@test.com", user_type=UserType.SERVICE_PROVIDER
    )
    sound_provider = _create_user(
        db, email="sound@test.com", user_type=UserType.SERVICE_PROVIDER
    )

    main_service = _create_service(
        db,
        artist_id=musician.id,
        title="Live show",
        service_type="Live Performance",
    )
    sound_service = _create_service(
        db,
        artist_id=sound_provider.id,
        title="PA System",
        service_type="Other",
    )

    parent_payload = BookingRequestCreate(
        artist_id=musician.id,
        service_id=main_service.id,
        message="Need a band and sound",
        travel_breakdown={
            "sound_required": True,
            "sound_mode": "external_providers",
            "selected_sound_service_id": sound_service.id,
            "event_city": "CPT",
        },
    )
    parent = crud_booking_request.create_booking_request(
        db=db,
        booking_request=parent_payload,
        client_id=client.id,
    )
    db.commit()
    db.refresh(parent)

    _maybe_create_linked_sound_booking_request(db, parent)

    child = (
        db.query(BookingRequest)
        .filter(BookingRequest.parent_booking_request_id == parent.id)
        .first()
    )
    assert child is not None
    assert child.client_id == client.id
    assert child.artist_id == sound_provider.id
    assert child.service_id == sound_service.id

