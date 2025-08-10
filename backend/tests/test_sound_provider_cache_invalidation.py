from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import api_sound_provider
from app.models.base import BaseModel
from app.schemas.sound_provider import SoundProviderCreate


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    return Session


def test_create_provider_invalidates_cache(monkeypatch):
    Session = setup_db()
    db = Session()
    called = {"flag": False}

    def fake_invalidate():
        called["flag"] = True

    monkeypatch.setattr(
        api_sound_provider,
        "invalidate_provider_list_cache",
        fake_invalidate,
    )
    payload = SoundProviderCreate(name="Test")
    api_sound_provider.create_provider(db=db, provider_in=payload)
    assert called["flag"]
    db.close()
