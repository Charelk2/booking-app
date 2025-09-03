import pytest
from decimal import Decimal
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import patch

from app.main import process_quote_expiration
from app import models
from app.models.base import BaseModel
from app.models import User, UserType, Service
from app.models.request_quote import BookingRequest, BookingStatus


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


@patch('app.main.notify_quote_expiring')
@patch('app.main.notify_quote_expired')
def test_process_quote_expiration(mock_expired, mock_expiring):
    db = setup_db()

    artist = User(
        email='a@test.com',
        password='x',
        first_name='A',
        last_name='R',
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email='c@test.com',
        password='x',
        first_name='C',
        last_name='L',
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    service = Service(
        artist_id=artist.id,
        title='Show',
        description='test',
        price=Decimal('100'),
        currency='ZAR',
        duration_minutes=60,
        service_type='Live Performance',
        media_url='x',
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    br1 = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime.utcnow(),
        status=BookingStatus.PENDING_QUOTE,
    )
    br2 = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        proposed_datetime_1=datetime.utcnow(),
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add_all([br1, br2])
    db.commit()
    db.refresh(br1)
    db.refresh(br2)

    q1 = models.QuoteV2(
        booking_request_id=br1.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[{'description': 'Gig', 'price': 100}],
        sound_fee=Decimal('0'),
        travel_fee=Decimal('0'),
        subtotal=Decimal('100'),
        total=Decimal('100'),
        status=models.QuoteStatusV2.PENDING,
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    q2 = models.QuoteV2(
        booking_request_id=br2.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[{'description': 'Gig', 'price': 100}],
        sound_fee=Decimal('0'),
        travel_fee=Decimal('0'),
        subtotal=Decimal('100'),
        total=Decimal('100'),
        status=models.QuoteStatusV2.PENDING,
        expires_at=datetime.utcnow() - timedelta(hours=1),
    )
    db.add_all([q1, q2])
    db.commit()

    process_quote_expiration(db)

    assert mock_expiring.call_count == 2
    assert mock_expired.call_count == 2
    db.refresh(q2)
    assert q2.status == models.QuoteStatusV2.EXPIRED
