import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["PYTEST_RUN"] = "1"

from app.core.config import settings
from app.api.api_video_orders import VideoOrderDeliverPayload, deliver_video_order
from app.models.base import BaseModel
from app.models import BookingRequest, User, UserType


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    return Session


def test_deliver_allows_paid_orders(monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_PV_ORDERS", True)

    Session = setup_db()
    db = Session()

    artist = User(
        email="artist@example.com",
        password="x",
        first_name="Art",
        last_name="Ist",
        user_type=UserType.SERVICE_PROVIDER,
        is_active=True,
    )
    client_user = User(
        email="client@example.com",
        password="y",
        first_name="Cli",
        last_name="Ent",
        user_type=UserType.CLIENT,
        is_active=True,
    )
    db.add_all([artist, client_user])
    db.commit()
    db.refresh(artist)
    db.refresh(client_user)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
        service_extras={"pv": {"status": "paid", "delivery_by_utc": "2025-12-31"}},
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    resp = deliver_video_order(
        order_id=br.id,
        body=VideoOrderDeliverPayload(delivery_url="https://youtube.com"),
        db=db,
        current_user=artist,
    )
    assert resp.status == "delivered"

    fresh = db.query(BookingRequest).filter(BookingRequest.id == br.id).first()
    assert fresh
    assert fresh.service_extras.get("pv", {}).get("status") == "delivered"
    assert fresh.service_extras.get("pv", {}).get("delivery_url") == "https://youtube.com"

    db.close()
