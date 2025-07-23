from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from app.models import (
    User,
    UserType,
    ArtistProfile,
    Service,
    Review,
    Booking,
)
from app.models.service import ServiceType
from app.models.base import BaseModel
from app.api.v1.api_artist import read_all_artist_profiles


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def create_artist(db, name, location, category, rating=5, bookings=0):
    user = User(email=f'{name}@test.com', password='x', first_name=name, last_name='L', user_type=UserType.ARTIST)
    db.add(user)
    db.commit()
    db.refresh(user)

    profile = ArtistProfile(user_id=user.id, business_name=name, location=location)
    service = Service(
        artist_id=user.id,
        title='Gig',
        price=100,
        duration_minutes=60,
        service_type=category,
    )
    profile.services.append(service)
    db.add(profile)
    db.commit()
    db.refresh(profile)

    for _ in range(bookings):
        b = Booking(
            artist_id=user.id,
            client_id=user.id,
            service_id=service.id,
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow(),
            total_price=100,
        )
        db.add(b)
    if rating:
        r = Review(artist_id=user.id, service_id=service.id, booking_id=1, rating=rating)
        db.add(r)
    db.commit()
    return profile


def test_price_range_filter(monkeypatch):
    db = setup_db()
    # Prices: 100, 500, 1000
    create_artist(db, 'Cheap', 'Joburg', ServiceType.LIVE_PERFORMANCE, rating=5)
    create_artist(db, 'Mid', 'Joburg', ServiceType.LIVE_PERFORMANCE, rating=5)
    db.query(Service).filter(Service.artist_id == 2).update({"price": 500})
    create_artist(db, 'Expensive', 'Joburg', ServiceType.LIVE_PERFORMANCE, rating=5)
    db.query(Service).filter(Service.artist_id == 3).update({"price": 1000})
    db.commit()

    monkeypatch.setattr(
        'app.utils.redis_cache.get_cached_artist_list',
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        'app.utils.redis_cache.cache_artist_list',
        lambda *args, **kwargs: None,
    )

    results = read_all_artist_profiles(
        category=ServiceType.LIVE_PERFORMANCE,
        min_price=300,
        max_price=800,
        db=db,
        page=1,
        limit=20,
    )
    assert len(results) == 1
    assert results[0].business_name == 'Mid'
    assert float(results[0].service_price) == 500


def test_price_visible_default_true():
    db = setup_db()
    user = User(email='a@test.com', password='x', first_name='A', last_name='B', user_type=UserType.ARTIST)
    db.add(user)
    db.commit()
    db.refresh(user)
    profile = ArtistProfile(user_id=user.id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    assert profile.price_visible is True


def test_filters_and_sorting(monkeypatch):
    db = setup_db()
    create_artist(db, 'Alpha', 'New York', ServiceType.LIVE_PERFORMANCE, rating=4, bookings=2)
    create_artist(db, 'Beta', 'San Francisco', ServiceType.OTHER, rating=5, bookings=5)

    monkeypatch.setattr(
        'app.utils.redis_cache.get_cached_artist_list',
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        'app.utils.redis_cache.cache_artist_list',
        lambda *args, **kwargs: None,
    )

    results = read_all_artist_profiles(
        category=ServiceType.OTHER,
        location='San',
        sort='most_booked',
        db=db,
        page=1,
        limit=20,
    )
    assert len(results) == 1
    assert results[0].business_name == 'Beta'
    assert results[0].rating == 5
    assert results[0].rating_count == 1


def test_service_price_none_without_category(monkeypatch):
    db = setup_db()
    create_artist(db, 'Solo', 'NY', ServiceType.LIVE_PERFORMANCE)
    monkeypatch.setattr(
        'app.utils.redis_cache.get_cached_artist_list',
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        'app.utils.redis_cache.cache_artist_list',
        lambda *args, **kwargs: None,
    )

    results = read_all_artist_profiles(db=db, page=1, limit=20)
    assert len(results) == 1
    assert results[0].service_price is None

