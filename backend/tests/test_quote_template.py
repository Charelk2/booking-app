from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.base import BaseModel
from app.api import api_quote_template, api_quote_v2
from app.models import User, UserType, BookingRequest, BookingStatus
from app.schemas import quote_template as schemas, QuoteV2Create
from fastapi import HTTPException


def setup_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_create_and_apply_template():
    db = setup_db()
    artist = User(email="a@test.com", password="x", first_name="A", last_name="T", user_type=UserType.SERVICE_PROVIDER)
    client = User(email="c@test.com", password="x", first_name="C", last_name="L", user_type=UserType.CLIENT)
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    template_in = schemas.QuoteTemplateCreate(
        artist_id=artist.id,
        name="Base",
        services=[schemas.ServiceItem(description="Show", price=10)],
        sound_fee=0,
        travel_fee=0,
    )
    tmpl = api_quote_template.create_quote_template(template_in, db)
    assert tmpl.name == "Base"

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=None,
        proposed_datetime_1=None,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteV2Create(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client.id,
        services=[schemas.ServiceItem(**tmpl.services[0]).model_dump()],
        sound_fee=tmpl.sound_fee,
        travel_fee=tmpl.travel_fee,
    )
    quote = api_quote_v2.create_quote(quote_in, db)
    assert quote.subtotal == 10
    assert quote.total == 10


def test_missing_template_raises():
    db = setup_db()
    try:
        api_quote_template.read_template(999, db)
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        assert False, "expected HTTPException"
