from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import User, UserType, BookingRequest, BookingStatus
from app.models.base import BaseModel


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_booking_status_round_trip():
    db = setup_db()
    client = User(email='c@test.com', password='x', first_name='C', last_name='Client', user_type=UserType.CLIENT)
    artist = User(email='a@test.com', password='x', first_name='A', last_name='Artist', user_type=UserType.SERVICE_PROVIDER)
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    for status in BookingStatus:
        br = BookingRequest(client_id=client.id, artist_id=artist.id, status=status)
        db.add(br)
        db.commit()
        fetched = db.get(BookingRequest, br.id)
        assert fetched.status == status
        db.delete(fetched)
        db.commit()
