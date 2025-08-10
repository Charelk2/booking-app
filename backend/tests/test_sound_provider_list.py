from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import BaseModel
from app.models import SoundProvider
from app.api import api_sound_provider


def setup_db():
    engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_list_providers_pagination_and_fields():
    db = setup_db()
    db.add_all([
        SoundProvider(name='A', contact_info='a'),
        SoundProvider(name='B', contact_info='b'),
        SoundProvider(name='C', contact_info='c'),
    ])
    db.commit()

    result = api_sound_provider.list_providers(db, skip=1, limit=1, fields='name')
    assert len(result) == 1
    item = result[0]
    assert item['name'] == 'B'
    assert 'contact_info' not in item
