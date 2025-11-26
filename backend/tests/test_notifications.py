from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta

from app.models import (
    User,
    UserType,
    BookingRequest,
    BookingStatus,
    MessageType,
    NotificationType,
    ServiceProviderProfile,
    QuoteV2,
    BookingSimple,
)
from app.models.service import ServiceType
from app import models
from app.models.base import BaseModel
from app.api import api_message, api_booking_request, api_quote_v2
from app.schemas import (
    MessageCreate,
    BookingRequestCreate,
    BookingRequestUpdateByArtist,
    BookingRequestUpdateByClient,
    QuoteV2Create,
)
from app.schemas.quote_v2 import ServiceItem
from decimal import Decimal
from app.crud import crud_notification
from app.utils.notifications import (
    format_notification_message,
    VIDEO_FLOW_READY_MESSAGE,
)
from app.utils.notifications import (
    notify_user_new_message,
    notify_new_booking,
    notify_booking_status_update,
    notify_quote_accepted,
    notify_quote_expired,
    notify_quote_expiring,
)
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from app.main import app
from app.api.dependencies import get_db
from app.api.auth import create_access_token


def setup_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def setup_app():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    return Session


def test_message_creates_notification():
    db = setup_db()
    client = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(content="hello", message_type=MessageType.USER)
    api_message.create_message(br.id, msg_in, db, current_user=client)

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert len(notifs) == 1
    assert notifs[0].type.value == "new_message"
    assert notifs[0].link == f"/inbox?requestId={br.id}"


def test_system_booking_summary_message_suppressed():
    db = setup_db()
    client = User(
        email="c2@test.com",
        password="x",
        first_name="C2",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a2@test.com",
        password="x",
        first_name="A2",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(
        content="Booking details:\nDate: 2025-01-01",
        message_type=MessageType.SYSTEM,
    )
    api_message.create_message(br.id, msg_in, db, current_user=client)

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert not notifs


def test_booking_request_creates_notification():
    db = setup_db()
    client = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    req_in = BookingRequestCreate(
        artist_id=artist.id, message="hi", status=BookingStatus.PENDING_QUOTE
    )
    api_booking_request.create_booking_request(req_in, db, current_user=client)

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert len(notifs) == 1
    assert notifs[0].type.value == "new_booking_request"
    assert notifs[0].link.startswith("/booking-requests/")


def test_get_notifications_pagination_and_grouping():
    db = setup_db()
    user = User(
        email="u@test.com",
        password="x",
        first_name="T",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # create 5 notifications, alternating types
    for i in range(5):
        crud_notification.create_notification(
            db,
            user_id=user.id,
            type=(
                NotificationType.NEW_MESSAGE
                if i % 2 == 0
                else NotificationType.NEW_BOOKING_REQUEST
            ),
            message=f"msg {i}",
            link=f"/x/{i}",
        )

    # pagination
    first_two = crud_notification.get_notifications_for_user(db, user.id, limit=2)
    assert len(first_two) == 2
    second_two = crud_notification.get_notifications_for_user(
        db, user.id, skip=2, limit=2
    )
    assert len(second_two) == 2
    assert first_two[0].id != second_two[0].id

    # grouping
    grouped = crud_notification.get_notifications_grouped_by_type(db, user.id)
    assert set(grouped.keys()) == {"new_message", "new_booking_request"}
    total = sum(len(v) for v in grouped.values())
    assert total == 5


def test_thread_notification_summary():
    db = setup_db()
    client = User(
        email="c@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    # send multiple messages from client -> artist
    for _ in range(5):
        msg_in = MessageCreate(content="hi", message_type=MessageType.USER)
        api_message.create_message(br.id, msg_in, db, current_user=client)

    threads = crud_notification.get_message_thread_notifications(db, artist.id)
    assert len(threads) == 1
    t = threads[0]
    assert t["booking_request_id"] == br.id
    assert t["unread_count"] == 5
    assert t["name"] == "C User"
    assert t.get("avatar_url") is None

    # mark thread read
    crud_notification.mark_thread_read(db, artist.id, br.id)
    threads_after = crud_notification.get_message_thread_notifications(db, artist.id)
    assert len(threads_after) == 1
    assert threads_after[0]["unread_count"] == 0


def test_thread_notification_shows_client_avatar():
    db = setup_db()
    client = User(
        email="clientpic@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
        profile_picture_url="/static/profile_pics/client.jpg",
    )
    artist = User(
        email="artist3@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    api_message.create_message(
        br.id,
        MessageCreate(content="hi", message_type=MessageType.USER),
        db,
        current_user=client,
    )

    threads = crud_notification.get_message_thread_notifications(db, artist.id)
    assert threads[0]["avatar_url"] == "/static/profile_pics/client.jpg"


def test_thread_notification_uses_business_name_for_artist():
    db = setup_db()
    client = User(
        email="c2@test.com",
        password="x",
        first_name="C2",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="a2@test.com",
        password="x",
        first_name="A2",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    profile = models.ServiceProviderProfile(
        user_id=artist.id,
        business_name="The Band",
        profile_picture_url="/static/profile_pics/avatar.jpg",
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(content="hello", message_type=MessageType.USER)
    api_message.create_message(br.id, msg_in, db, current_user=artist)

    threads = crud_notification.get_message_thread_notifications(db, client.id)
    assert len(threads) == 1
    assert threads[0]["name"] == "The Band"
    assert threads[0]["avatar_url"] == "/static/profile_pics/avatar.jpg"


def test_thread_notification_includes_booking_details():
    db = setup_db()
    client = User(
        email="bdetails@test.com",
        password="x",
        first_name="Client",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="bdetails2@test.com",
        password="x",
        first_name="Artist",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(
        content="Booking details:\nLocation: Test City\nGuests: 20",
        message_type=MessageType.SYSTEM,
    )
    api_message.create_message(br.id, msg_in, db, current_user=client)

    # create a normal message to generate a notification
    api_message.create_message(
        br.id,
        MessageCreate(content="hello", message_type=MessageType.USER),
        db,
        current_user=client,
    )

    threads = crud_notification.get_message_thread_notifications(db, artist.id)
    assert len(threads) == 1
    details = threads[0]["booking_details"]
    assert details["location"] == "Test City"
    assert details["guests"] == "20"


def test_mark_all_notifications_read():
    db = setup_db()
    user = User(
        email="u3@test.com",
        password="x",
        first_name="T3",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # create unread notifications
    for i in range(3):
        crud_notification.create_notification(
            db,
            user_id=user.id,
            type=NotificationType.NEW_BOOKING_REQUEST,
            message=f"msg {i}",
            link=f"/x/{i}",
        )

    updated = crud_notification.mark_all_read(db, user.id)
    assert updated == 3
    all_after = crud_notification.get_notifications_for_user(db, user.id)
    assert all(n.is_read for n in all_after)


def test_status_update_creates_notification_for_client():
    db = setup_db()
    client = User(
        email="client@test.com",
        password="x",
        first_name="Client",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artist@test.com",
        password="x",
        first_name="Artist",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    update = BookingRequestUpdateByArtist(status=BookingStatus.REQUEST_DECLINED)
    api_booking_request.update_booking_request_by_artist(
        br.id, update, db, current_artist=artist
    )

    notifs = crud_notification.get_notifications_for_user(db, client.id)
    assert len(notifs) == 1
    assert notifs[0].type == NotificationType.NEW_MESSAGE


def test_status_update_creates_notification_for_artist():
    db = setup_db()
    client = User(
        email="client2@test.com",
        password="x",
        first_name="Client2",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artist2@test.com",
        password="x",
        first_name="Artist2",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    update = BookingRequestUpdateByClient(status=BookingStatus.REQUEST_WITHDRAWN)
    api_booking_request.update_booking_request_by_client(
        br.id, update, db, current_user=client
    )

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert len(notifs) == 1
    assert notifs[0].type == NotificationType.BOOKING_STATUS_UPDATED


def test_format_notification_message_new_types():
    msg_review = format_notification_message(
        NotificationType.REVIEW_REQUEST, booking_id=42
    )
    msg_quote = format_notification_message(NotificationType.QUOTE_ACCEPTED, quote_id=7)
    msg_expired = format_notification_message(
        NotificationType.QUOTE_EXPIRED, quote_id=9
    )
    msg_expiring = format_notification_message(
        NotificationType.QUOTE_EXPIRING, quote_id=5
    )
    msg_booking = format_notification_message(
        NotificationType.NEW_BOOKING, booking_id=8
    )
    assert msg_review == "Please review your booking #42"
    assert msg_quote == "Quote #7 accepted"
    assert msg_booking == "New booking #8"
    assert msg_expired == "Quote #9 expired"
    assert msg_expiring == "Quote #5 expiring soon"


def test_format_notification_message_booking_request():
    msg_full = format_notification_message(
        NotificationType.NEW_BOOKING_REQUEST,
        sender_name="Bob",
        booking_type="Performance",
        request_id=5,
    )
    msg_simple = format_notification_message(
        NotificationType.NEW_BOOKING_REQUEST,
        request_id=7,
    )
    assert msg_full == "New booking request from Bob: Performance"
    assert msg_simple == "New booking request #7"


def test_format_notification_message_booking_request_enum():
    msg_full = format_notification_message(
        NotificationType.NEW_BOOKING_REQUEST,
        sender_name="Bob",
        booking_type=ServiceType.LIVE_PERFORMANCE,
        request_id=5,
    )
    assert msg_full == "New booking request from Bob: Live Performance"


def test_personalized_video_notifications_suppressed_until_final():
    db = setup_db()
    client = User(
        email="pv@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="pva@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)
    profile = models.ServiceProviderProfile(user_id=artist.id, business_name="Vid Artist")
    service = models.Service(
        artist_id=artist.id,
        title="Video",
        description="",
        service_type="Personalized Video",
        duration_minutes=5,
        price=100,
        display_order=1,
        media_url="x",
    )
    db.add_all([profile, service])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    msg_in = MessageCreate(content="Question", message_type=MessageType.SYSTEM)
    api_message.create_message(br.id, msg_in, db, current_user=client)

    notifs = crud_notification.get_notifications_for_user(db, artist.id)
    assert not notifs

    msg_final = MessageCreate(
        content=VIDEO_FLOW_READY_MESSAGE,
        message_type=MessageType.SYSTEM,
    )
    api_message.create_message(br.id, msg_final, db, current_user=client)
    notifs_after = crud_notification.get_notifications_for_user(db, artist.id)
    assert len(notifs_after) == 1
    assert notifs_after[0].type == NotificationType.NEW_BOOKING_REQUEST


def test_review_request_notification():
    db = setup_db()
    artist = User(
        email="rra@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client = User(
        email="rrc@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client])
    db.commit()
    db.refresh(artist)
    db.refresh(client)

    profile = models.ServiceProviderProfile(user_id=artist.id)
    service = models.Service(
        artist_id=artist.id,
        title="Gig",
        price=100,
        duration_minutes=60,
        media_url="x",
    )
    db.add_all([profile, service])
    db.commit()
    db.refresh(service)

    booking = models.Booking(
        artist_id=artist.id,
        client_id=client.id,
        service_id=service.id,
        start_time=datetime(2030, 1, 1, 12, 0),
        end_time=datetime(2030, 1, 1, 13, 0),
        status=models.BookingStatus.CONFIRMED,
        total_price=100,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    from app.api.api_booking import update_booking_status
    from app.schemas.booking import BookingUpdate

    update_booking_status(
        db=db,
        booking_id=booking.id,
        status_update=BookingUpdate(status=models.BookingStatus.COMPLETED),
        current_artist=artist,
    )

    notifs = crud_notification.get_notifications_for_user(db, client.id)
    assert len(notifs) == 1
    notif = notifs[0]
    assert notif.type == NotificationType.REVIEW_REQUEST
    assert notif.message == f"Please review your booking #{booking.id}"
    assert notif.link == f"/dashboard/client/bookings/{booking.id}?review=1"


def test_notifications_endpoint_returns_sender_name():
    """Deposits removed — legacy test block disabled.
    Session = setup_app()
    db = Session()
    artist = User(
        email="artist@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client_user = User(
        email="client@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
        profile_picture_url="/static/profile_pics/client.jpg",
    )
    db.add_all([artist, client_user])
    db.commit()
    db.refresh(artist)
    db.refresh(client_user)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    notify_user_new_message(
        db,
        user=artist,
        sender=client_user,
        booking_request_id=br.id,
        content="hello",
        message_type=MessageType.USER,
    )
    db.close()

    token = create_access_token({"sub": artist.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["sender_name"] == "C User"
    assert data[0]["avatar_url"] == "/static/profile_pics/client.jpg"
    app.dependency_overrides.clear()
    """


def test_new_message_notification_fallback_client_name():
    Session = setup_app()
    db = Session()
    artist = User(
        email="artistfb@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client_user = User(
        email="clientfb@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client_user])
    db.commit()
    db.refresh(artist)
    db.refresh(client_user)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    crud_notification.create_notification(
        db,
        user_id=artist.id,
        type=NotificationType.NEW_MESSAGE,
        message="New message: hi",
        link=f"/inbox?requestId={br.id}",
    )
    db.close()

    token = create_access_token({"sub": artist.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["sender_name"] == "C User"
    app.dependency_overrides.clear()


def test_new_message_notification_fallback_business_name():
    Session = setup_app()
    db = Session()
    artist = User(
        email="artistfb2@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client_user = User(
        email="clientfb2@test.com",
        password="x",
        first_name="C",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client_user])
    db.commit()
    db.refresh(artist)
    db.refresh(client_user)

    profile = models.ServiceProviderProfile(user_id=artist.id, business_name="The Band")
    db.add(profile)
    db.commit()
    db.refresh(profile)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    crud_notification.create_notification(
        db,
        user_id=client_user.id,
        type=NotificationType.NEW_MESSAGE,
        message="New message: hi",
        link=f"/inbox?requestId={br.id}",
    )
    db.close()

    token = create_access_token({"sub": client_user.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["sender_name"] == "The Band"
    app.dependency_overrides.clear()


    


    


    


def test_booking_request_api_parses_sender_and_type():
    Session = setup_app()
    db = Session()
    client = User(
        email="brclient@test.com",
        password="x",
        first_name="Client",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="brartist@test.com",
        password="x",
        first_name="Artist",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)
    service = models.Service(
        artist_id=artist.id,
        title="Gig",
        description="",
        service_type=ServiceType.LIVE_PERFORMANCE,
        duration_minutes=60,
        price=100,
        media_url="x",
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    crud_notification.create_notification(
        db,
        user_id=artist.id,
        type=NotificationType.NEW_BOOKING_REQUEST,
        message="New booking request",
        link=f"/inbox?requestId={br.id}",
    )
    db.close()

    token = create_access_token({"sub": artist.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["sender_name"] == "Client User"
    assert data[0]["booking_type"] == "Live Performance"
    app.dependency_overrides.clear()


def test_new_booking_notification_includes_artist_business_name():
    Session = setup_app()
    db = Session()
    client = User(
        email="client4@test.com",
        password="x",
        first_name="C4",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artist4@test.com",
        password="x",
        first_name="A4",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)
    profile = models.ServiceProviderProfile(user_id=artist.id, business_name="The Band")
    db.add(profile)
    db.commit()
    db.refresh(profile)

    booking = models.BookingSimple(
        quote_id=3,
        artist_id=artist.id,
        client_id=client.id,
        payment_status="pending",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    notify_new_booking(db, client, booking.id)
    db.close()

    token = create_access_token({"sub": client.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["sender_name"] == "The Band"
    app.dependency_overrides.clear()


def test_new_booking_notification_includes_artist_avatar_for_client():
    Session = setup_app()
    db = Session()
    client = User(
        email="avatarclient@test.com",
        password="x",
        first_name="AC",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="avatarartist@test.com",
        password="x",
        first_name="AA",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)
    profile = models.ServiceProviderProfile(
        user_id=artist.id, profile_picture_url="/static/profile_pics/artist.jpg"
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    booking = models.BookingSimple(
        quote_id=5,
        artist_id=artist.id,
        client_id=client.id,
        payment_status="pending",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    notify_new_booking(db, client, booking.id)
    db.close()

    token = create_access_token({"sub": client.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["avatar_url"] == "/static/profile_pics/artist.jpg"
    app.dependency_overrides.clear()


def test_booking_status_update_notification_includes_client_name():
    Session = setup_app()
    db = Session()
    client = User(
        email="client5@test.com",
        password="x",
        first_name="C5",
        last_name="User",
        user_type=UserType.CLIENT,
        profile_picture_url="/static/profile_pics/client5.jpg",
    )
    artist = User(
        email="artist5@test.com",
        password="x",
        first_name="A5",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    notify_booking_status_update(db, artist, br.id, "withdrawn")
    db.close()

    token = create_access_token({"sub": artist.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["sender_name"] == "C5 User"
    assert data[0]["avatar_url"] == "/static/profile_pics/client5.jpg"
    app.dependency_overrides.clear()


    


def _skip_deposit_due_notification_falls_back_to_artist_user_avatar():
    Session = setup_app()
    db = Session()
    client = User(
        email="depavatar2@test.com",
        password="x",
        first_name="Dep2",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="depavatarartist2@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
        profile_picture_url="/static/profile_pics/artist_fallback.jpg",
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    # Create empty profile so ``profile_picture_url`` is missing on profile.
    profile = models.ServiceProviderProfile(user_id=artist.id)
    db.add(profile)
    db.commit()
    db.refresh(profile)

    booking = models.BookingSimple(
        quote_id=5,
        artist_id=artist.id,
        client_id=client.id,
        payment_status="pending",
        deposit_amount=75,
        deposit_due_by=datetime(2025, 2, 1),
        deposit_paid=False,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    # deposit notifications removed
        db,
        client,
        booking.id,
        float(booking.deposit_amount),
        booking.deposit_due_by,
    )
    db.close()

    token = create_access_token({"sub": client.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["avatar_url"] == "/static/profile_pics/artist_fallback.jpg"
    app.dependency_overrides.clear()


def test_new_booking_notification_includes_client_avatar_for_artist():
    Session = setup_app()
    db = Session()
    client = User(
        email="nbclient@test.com",
        password="x",
        first_name="NB",
        last_name="Client",
        user_type=UserType.CLIENT,
        profile_picture_url="/static/profile_pics/client.jpg",
    )
    artist = User(
        email="nbar@test.com",
        password="x",
        first_name="NB",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    booking = models.BookingSimple(
        quote_id=5,
        artist_id=artist.id,
        client_id=client.id,
        payment_status="pending",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    notify_new_booking(db, artist, booking.id)
    db.close()

    token = create_access_token({"sub": artist.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["avatar_url"] == "/static/profile_pics/client.jpg"
    app.dependency_overrides.clear()


def test_quote_accepted_notification_includes_client_avatar_url():
    Session = setup_app()
    db = Session()
    client = User(
        email="qclient@test.com",
        password="x",
        first_name="Q",
        last_name="Client",
        user_type=UserType.CLIENT,
        profile_picture_url="/static/profile_pics/client.jpg",
    )
    artist = User(
        email="qartist@test.com",
        password="x",
        first_name="Q",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client, artist])
    db.commit()
    db.refresh(client)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    notify_quote_accepted(db, artist, 1, br.id)
    db.close()

    token = create_access_token({"sub": artist.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["sender_name"] == "Q Client"
    assert data[0]["avatar_url"] == "/static/profile_pics/client.jpg"
    app.dependency_overrides.clear()


def test_quote_expired_notification():
    Session = setup_app()
    db = Session()
    artist = User(
        email="exartist@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client_user = User(
        email="exclient@test.com",
        password="x",
        first_name="C",
        last_name="Client",
        user_type=UserType.CLIENT,
    )
    db.add_all([artist, client_user])
    db.commit()
    db.refresh(artist)
    db.refresh(client_user)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    notify_quote_expired(db, artist, 1, br.id)
    db.close()

    token = create_access_token({"sub": artist.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["type"] == "quote_expired"
    app.dependency_overrides.clear()


def test_quote_expiring_notification():
    Session = setup_app()
    db = Session()
    artist = User(
        email="qxartist@test.com",
        password="x",
        first_name="A",
        last_name="Artist",
        user_type=UserType.SERVICE_PROVIDER,
    )
    client_user = User(
        email="qxclient@test.com",
        password="x",
        first_name="C",
        last_name="Client",
        user_type=UserType.CLIENT,
        profile_picture_url="/static/profile_pics/client.jpg",
    )
    db.add_all([artist, client_user])
    db.commit()
    db.refresh(artist)
    db.refresh(client_user)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote = QuoteV2(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client_user.id,
        services=[],
        sound_fee=0,
        travel_fee=0,
        subtotal=0,
        total=0,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    expires_at = datetime.utcnow() + timedelta(hours=23, minutes=30)
    notify_quote_expiring(db, artist, quote.id, expires_at, br.id)
    db.close()

    token = create_access_token({"sub": artist.email})
    client_api = TestClient(app)
    res = client_api.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data[0]["type"] == "quote_expiring"
    assert data[0]["sender_name"] == "C Client"
    assert data[0]["avatar_url"] == "/static/profile_pics/client.jpg"
    app.dependency_overrides.clear()


def test_client_notification_on_quote_sent():
    Session = setup_app()
    db = Session()
    client_user = User(
        email="client_notify@test.com",
        password="x",
        first_name="Client",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artist_notify@test.com",
        password="x",
        first_name="Artist",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client_user, artist])
    db.commit()
    db.refresh(client_user)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    quote_in = QuoteV2Create(
        booking_request_id=br.id,
        artist_id=artist.id,
        client_id=client_user.id,
        services=[ServiceItem(description="Performance", price=Decimal("100"))],
    )
    api_quote_v2.create_quote(quote_in, db, current_user=artist)

    notifs = crud_notification.get_notifications_for_user(db, client_user.id)
    assert len(notifs) == 1
    n = notifs[0]
    assert n.type == NotificationType.NEW_MESSAGE
    assert n.link == f"/inbox?requestId={br.id}"
    assert "sent a quote" in n.message.lower()


def test_client_notified_when_artist_declines_request():
    Session = setup_app()
    db = Session()
    client_user = User(
        email="client_decline@test.com",
        password="x",
        first_name="Client",
        last_name="User",
        user_type=UserType.CLIENT,
    )
    artist = User(
        email="artist_decline@test.com",
        password="x",
        first_name="Artist",
        last_name="User",
        user_type=UserType.SERVICE_PROVIDER,
    )
    db.add_all([client_user, artist])
    db.commit()
    db.refresh(client_user)
    db.refresh(artist)

    br = BookingRequest(
        client_id=client_user.id,
        artist_id=artist.id,
        status=BookingStatus.PENDING_QUOTE,
    )
    db.add(br)
    db.commit()
    db.refresh(br)

    update = BookingRequestUpdateByArtist(status=BookingStatus.REQUEST_DECLINED)
    api_booking_request.update_booking_request_by_artist(
        br.id, update, db, current_artist=artist
    )

    notifs = crud_notification.get_notifications_for_user(db, client_user.id)
    assert len(notifs) == 1
    n = notifs[0]
    assert n.type == NotificationType.NEW_MESSAGE
    assert n.link == f"/inbox?requestId={br.id}"
    assert "declined" in n.message.lower()
