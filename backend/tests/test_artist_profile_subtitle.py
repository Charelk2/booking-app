import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.service_provider_profile import ServiceProviderProfile
from app.models.user import User, UserType
from app.models.base import BaseModel
from app.schemas.artist import ArtistProfileResponse


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_custom_subtitle_field_roundtrip():
    db = setup_db()
    user = User(email='a@test.com', password='x', first_name='A', last_name='B', user_type=UserType.SERVICE_PROVIDER)
    db.add(user)
    db.commit()
    db.refresh(user)

    profile = ServiceProviderProfile(user_id=user.id, business_name='The Band', custom_subtitle='Indie Rock Band')
    db.add(profile)
    db.commit()
    db.refresh(profile)

    schema = ArtistProfileResponse.model_validate(profile)
    assert schema.custom_subtitle == 'Indie Rock Band'
