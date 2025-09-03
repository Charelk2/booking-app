from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from app.models import (
    User,
    UserType,
    ServiceProviderProfile,
    Service,
    Review,
    Booking,
    ServiceCategory,
)
from app.models.base import BaseModel
from app.api.v1.api_service_provider import read_all_service_provider_profiles


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def create_artist(db, name, location, category_name, rating=5, bookings=0):
    user = User(email=f'{name}@test.com', password='x', first_name=name, last_name='L', user_type=UserType.SERVICE_PROVIDER)
    db.add(user)
    db.commit()
    db.refresh(user)

    # Ensure the service category exists
    cat = db.query(ServiceCategory).filter(ServiceCategory.name == category_name).first()
    if not cat:
        cat = ServiceCategory(name=category_name)
        db.add(cat)
        db.commit()
        db.refresh(cat)

    profile = ServiceProviderProfile(
        user_id=user.id,
        business_name=name,
        location=location,
    )
    service = Service(
        artist_id=user.id,
        title='Gig',
        price=100,
        duration_minutes=60,
        media_url='x',
        service_category_id=cat.id,
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
    create_artist(db, 'Cheap', 'Joburg', 'Musician', rating=5)
    create_artist(db, 'Mid', 'Joburg', 'Musician', rating=5)
    db.query(Service).filter(Service.artist_id == 2).update({"price": 500})
    create_artist(db, 'Expensive', 'Joburg', 'Musician', rating=5)
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

    res = read_all_service_provider_profiles(
        category='musician',
        min_price=300,
        max_price=800,
        db=db,
        page=1,
        limit=20,
    )
    assert len(res["data"]) == 1
    assert res["data"][0].business_name == 'Mid'
    assert float(res["data"][0].service_price) == 500


def test_price_visible_default_true():
    db = setup_db()
    user = User(email='a@test.com', password='x', first_name='A', last_name='B', user_type=UserType.SERVICE_PROVIDER)
    db.add(user)
    db.commit()
    db.refresh(user)
    profile = ServiceProviderProfile(user_id=user.id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    assert profile.price_visible is True


def test_filters_and_sorting(monkeypatch):
    db = setup_db()
    create_artist(db, 'Alpha', 'New York', 'Musician', rating=4, bookings=2)
    create_artist(db, 'Beta', 'San Francisco', 'Videographer', rating=5, bookings=5)

    monkeypatch.setattr(
        'app.utils.redis_cache.get_cached_artist_list',
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        'app.utils.redis_cache.cache_artist_list',
        lambda *args, **kwargs: None,
    )

    res = read_all_service_provider_profiles(
        category='videographer',
        location='San',
        sort='most_booked',
        db=db,
        page=1,
        limit=20,
    )
    assert len(res["data"]) == 1
    assert res["data"][0].business_name == 'Beta'
    assert res["data"][0].rating == 5
    assert res["data"][0].rating_count == 1


def test_service_price_none_without_category(monkeypatch):
    db = setup_db()
    create_artist(db, 'Solo', 'NY', 'Musician')
    monkeypatch.setattr(
        'app.utils.redis_cache.get_cached_artist_list',
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        'app.utils.redis_cache.cache_artist_list',
        lambda *args, **kwargs: None,
    )

    res = read_all_service_provider_profiles(db=db, page=1, limit=20)
    assert len(res["data"]) == 1
    assert res["data"][0].service_price is None


def test_unknown_category_returns_empty(monkeypatch):
    db = setup_db()
    create_artist(db, 'Solo', 'NY', 'Musician')
    monkeypatch.setattr(
        'app.utils.redis_cache.get_cached_artist_list',
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        'app.utils.redis_cache.cache_artist_list',
        lambda *args, **kwargs: None,
    )

    res = read_all_service_provider_profiles(
        category='videographer', db=db, page=1, limit=20
    )
    assert res["data"] == []
    assert res["total"] == 0


def test_price_distribution_with_join_services(monkeypatch):
    """Ensure price distribution is calculated without unpack errors."""
    db = setup_db()
    # Create three artists with different prices so they land in distinct buckets
    create_artist(db, 'Cheap', 'NY', 'Musician')
    create_artist(db, 'Mid', 'NY', 'Musician')
    db.query(Service).filter(Service.artist_id == 2).update({"price": 2500})
    create_artist(db, 'High', 'NY', 'Musician')
    db.query(Service).filter(Service.artist_id == 3).update({"price": 10000})
    db.commit()

    monkeypatch.setattr(
        'app.utils.redis_cache.get_cached_artist_list',
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        'app.utils.redis_cache.cache_artist_list',
        lambda *args, **kwargs: None,
    )

    res = read_all_service_provider_profiles(
        category='musician',
        include_price_distribution=True,
        db=db,
        page=1,
        limit=20,
    )

    # Verify all three artists returned and price distribution counted correctly
    assert res["total"] == 3
    pd = {(b["min"], b["max"]): b["count"] for b in res["price_distribution"]}
    assert pd[(0, 1000)] == 1
    assert pd[(2001, 3000)] == 1
    assert pd[(7501, 10000)] == 1

