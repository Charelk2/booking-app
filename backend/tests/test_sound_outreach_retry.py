from datetime import datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.auth import create_access_token
from app.api.dependencies import get_db
from app.main import app
from app.models import (
    Booking,
    BookingStatus,
    Service,
    ServiceCategory,
    ServiceProviderProfile,
    User,
    UserType,
)
from app.models.sound_outreach import SoundOutreachRequest


def setup_app():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from app.models.base import BaseModel

    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    return Session


def seed_data(db):
    """Seed database with basic booking, service and users."""
    artist = User(
        email="artist@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="client@test.com",
        password="x",
        first_name="C",
        last_name="Client",
        user_type=UserType.CLIENT,
    )
    supplier_user = User(
        email="supplier@test.com",
        password="x",
        first_name="S",
        last_name="Supplier",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([artist, client, supplier_user])
    db.commit()
    db.refresh(artist)
    db.refresh(client)
    db.refresh(supplier_user)

    artist_profile = ServiceProviderProfile(user_id=artist.id)
    supplier_profile = ServiceProviderProfile(user_id=supplier_user.id)
    db.add_all([artist_profile, supplier_profile])
    db.commit()

    sound_cat = ServiceCategory(name="Sound Service")
    db.add(sound_cat)
    db.commit()
    db.refresh(sound_cat)

    service = Service(
        artist_id=artist.id,
        title="Show",
        price=Decimal("100"),
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
    )
    supplier_service = Service(
        artist_id=supplier_user.id,
        title="PA in CPT",
        price=Decimal("500"),
        duration_minutes=60,
        service_type="Other",
        media_url="x",
        service_category_id=sound_cat.id,
        details={"coverage": ["CPT"]},
    )
    db.add_all([service, supplier_service])
    db.commit()
    db.refresh(service)
    db.refresh(supplier_service)

    booking = Booking(
        artist_id=artist.id,
        client_id=client.id,
        service_id=service.id,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(hours=1),
        status=BookingStatus.PENDING,
        total_price=Decimal("0.00"),
        event_city=None,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    return booking, artist, supplier_service


def test_retry_outreach_reads_body_event_city():
    Session = setup_app()
    db = Session()
    client_api = TestClient(app)

    booking, artist, supplier_service = seed_data(db)

    token = create_access_token({"sub": artist.email})
    res = client_api.post(
        f"/api/v1/bookings/{booking.id}/sound/retry",
        json={"event_city": "CPT"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "restarted"
    assert data["count"] == 1
    rows = db.query(SoundOutreachRequest).all()
    assert len(rows) == 1
    assert rows[0].supplier_service_id == supplier_service.id


def test_retry_outreach_without_city_returns_422():
    Session = setup_app()
    db = Session()
    client_api = TestClient(app)

    booking, artist, _ = seed_data(db)

    token = create_access_token({"sub": artist.email})
    res = client_api.post(
        f"/api/v1/bookings/{booking.id}/sound/retry",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422
    data = res.json()
    assert (
        data["detail"]["message"]
        == "Booking %s missing event city. Provide ?event_city=<city> or include event_city in the JSON body." % booking.id
    )
    assert data["detail"]["field_errors"] == {"event_city": "required"}
