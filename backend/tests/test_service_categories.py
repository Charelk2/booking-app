from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import BaseModel
from app.models import User, UserType
from app.models.artist_profile_v2 import ArtistProfileV2
from app.models.service_category import ServiceCategory


def setup_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_service_category_linking():
    db = setup_db()
    category = ServiceCategory(name="Test Category")
    db.add(category)
    db.commit()
    db.refresh(category)

    user = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    profile = ArtistProfileV2(user_id=user.id, service_category_id=category.id)
    db.add(profile)
    db.commit()
    db.refresh(profile)

    assert profile.service_category_id == category.id
    assert profile.service_category.name == "Test Category"
