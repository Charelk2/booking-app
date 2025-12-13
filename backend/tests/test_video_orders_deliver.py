import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["PYTEST_RUN"] = "1"

from app.core.config import settings
from app.api.api_video_orders import VideoOrderDeliverPayload, deliver_video_order
from app.models.base import BaseModel
from app.models import BookingRequest, Message, MessageType, User, UserType


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
    msgs = db.query(Message).filter(Message.booking_request_id == br.id).all()
    assert any(m.message_type == MessageType.USER for m in msgs)

    db.close()


def test_deliver_can_attach_video(monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_PV_ORDERS", True)

    Session = setup_db()
    db = Session()

    artist = User(
        email="artist2@example.com",
        password="x",
        first_name="Art",
        last_name="Ist",
        user_type=UserType.SERVICE_PROVIDER,
        is_active=True,
    )
    client_user = User(
        email="client2@example.com",
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

    attachment_url = "https://example.com/video.mp4"
    attachment_meta = {"content_type": "video/mp4", "original_filename": "video.mp4", "size": 123}
    resp = deliver_video_order(
        order_id=br.id,
        body=VideoOrderDeliverPayload(
            attachment_url=attachment_url,
            attachment_meta=attachment_meta,
        ),
        db=db,
        current_user=artist,
    )
    assert resp.status == "delivered"

    fresh = db.query(BookingRequest).filter(BookingRequest.id == br.id).first()
    assert fresh
    pv = fresh.service_extras.get("pv", {})
    assert pv.get("delivery_attachment_url") == attachment_url
    assert isinstance(pv.get("delivery_attachment_meta"), dict)

    msg = (
        db.query(Message)
        .filter(Message.booking_request_id == br.id)
        .order_by(Message.id.desc())
        .first()
    )
    assert msg is not None
    assert msg.message_type == MessageType.USER
    assert msg.attachment_url == attachment_url

    db.close()
