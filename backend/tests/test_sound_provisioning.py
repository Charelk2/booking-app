from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.base import BaseModel
from app.models import Service, User, UserType
from app.services.booking_quote import calculate_quote_breakdown


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def create_service(db, *, details=None, price=100):
    artist = User(
        email="artist@test.com",
        password="x",
        first_name="A",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(artist)
    db.commit()
    db.refresh(artist)

    service = Service(
        artist_id=artist.id,
        title="Show",
        price=Decimal(str(price)),
        duration_minutes=60,
        service_type="Live Performance",
        media_url="x",
        details=details or {},
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


def create_provider(db, *, price=500):
    provider_user = User(
        email="provider@test.com",
        password="x",
        first_name="P",
        last_name="R",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(provider_user)
    db.commit()
    db.refresh(provider_user)

    provider = Service(
        artist_id=provider_user.id,
        title="PA System",
        price=Decimal(str(price)),
        duration_minutes=60,
        service_type="Other",
        media_url="x",
        service_category_id=None,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def test_external_provider_fallback():
    db = setup_db()
    provider = create_provider(db)
    service = create_service(
        db,
        details={
            "sound_provisioning": {
                "mode": "external_providers",
                "city_preferences": [
                    {"city": "CPT", "provider_ids": [provider.id]},
                ],
            }
        },
    )

    breakdown = calculate_quote_breakdown(
        Decimal("100"),
        10,
        service=service,
        event_city="JNB",  # no matching city, should fallback
        db=db,
    )

    assert breakdown["sound_cost"] == Decimal("500.00")
    assert breakdown["sound_mode"] == "external_providers"
    assert breakdown["sound_provider_id"] == provider.id


def test_own_sound_flight_override():
    db = setup_db()
    provider = create_provider(db)
    service = create_service(
        db,
        details={
            "sound_provisioning": {
                "mode": "own_sound_drive_only",
                "city_preferences": [
                    {"city": "CPT", "provider_ids": [provider.id]},
                ],
            }
        },
    )

    breakdown = calculate_quote_breakdown(
        Decimal("100"),
        600,  # distance triggers flight mode
        service=service,
        event_city="CPT",
        db=db,
    )

    assert breakdown["sound_cost"] == Decimal("500.00")
    assert breakdown["sound_mode"] == "external_providers"
    assert breakdown["sound_mode_overridden"] is True
    assert breakdown["sound_provider_id"] == provider.id


def test_artist_provides_variable():
    db = setup_db()
    service = create_service(
        db,
        details={
            "sound_provisioning": {
                "mode": "artist_provides_variable",
                "price_driving_sound_zar": 1000,
                "price_flying_sound_zar": 7500,
            }
        },
    )

    drive = calculate_quote_breakdown(
        Decimal("100"),
        50,
        service=service,
        event_city="JNB",
        db=db,
    )
    fly = calculate_quote_breakdown(
        Decimal("100"),
        1000,
        service=service,
        event_city="JNB",
        db=db,
    )

    assert drive["sound_cost"] == Decimal("1000")
    assert fly["sound_cost"] == Decimal("7500")
