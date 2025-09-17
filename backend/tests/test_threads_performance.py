from datetime import datetime
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.crud import crud_booking_request, crud_notification
from app.models.base import BaseModel
from app.models import (
    BookingRequest,
    BookingStatus,
    Message,
    MessageType,
    Notification,
    NotificationType,
    Quote,
    QuoteStatus,
    SenderType,
    Service,
    ServiceProviderProfile,
    User,
    UserType,
    VisibleTo,
)
from app.models.service import ServiceType


def make_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BaseModel.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    return Session()


def create_user(db, email: str, user_type: UserType) -> User:
    user = User(
        email=email,
        password="x",
        first_name=email.split("@")[0],
        last_name="User",
        user_type=user_type,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def attach_profile(db, artist: User, business_name: str = "Band") -> ServiceProviderProfile:
    profile = ServiceProviderProfile(
        user_id=artist.id,
        business_name=business_name,
        onboarding_completed=True,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def create_service(
    db,
    artist_profile: ServiceProviderProfile,
    service_type: ServiceType = ServiceType.LIVE_PERFORMANCE,
) -> Service:
    service = Service(
        artist_id=artist_profile.user_id,
        title="Show",
        description="Set",
        media_url="https://example.com/demo",
        price=Decimal("100.00"),
        currency="ZAR",
        duration_minutes=60,
        service_type=service_type.value,
        status="approved",
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


def create_booking_request(
    db,
    client: User,
    artist: User,
    service: Service | None = None,
    status: BookingStatus = BookingStatus.PENDING_QUOTE,
) -> BookingRequest:
    br = BookingRequest(
        client_id=client.id,
        artist_id=artist.id,
        service_id=service.id if service else None,
        status=status,
    )
    db.add(br)
    db.commit()
    db.refresh(br)
    return br


def create_message(
    db,
    booking_request: BookingRequest,
    sender: User,
    content: str,
    message_type: MessageType = MessageType.USER,
    system_key: str | None = None,
    timestamp: datetime | None = None,
) -> Message:
    msg = Message(
        booking_request_id=booking_request.id,
        sender_id=sender.id,
        sender_type=SenderType.ARTIST if sender.user_type == UserType.SERVICE_PROVIDER else SenderType.CLIENT,
        message_type=message_type,
        visible_to=VisibleTo.BOTH,
        content=content,
        system_key=system_key,
    )
    if timestamp is not None:
        msg.timestamp = timestamp
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def create_quote(db, booking_request: BookingRequest, artist: User, status: QuoteStatus) -> Quote:
    quote = Quote(
        booking_request_id=booking_request.id,
        artist_id=artist.id,
        quote_details="Details",
        price=Decimal("250.00"),
        currency="ZAR",
        status=status,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)
    return quote


def create_notification(
    db,
    user: User,
    link: str,
    is_read: bool,
    when: datetime,
) -> Notification:
    notif = Notification(
        user_id=user.id,
        type=NotificationType.NEW_MESSAGE,
        link=link,
        message="msg",
        is_read=is_read,
        timestamp=when,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def test_minimal_thread_payload_preserves_preview_and_quote():
    db = make_session()

    client = create_user(db, "client@example.com", UserType.CLIENT)
    artist = create_user(db, "artist@example.com", UserType.SERVICE_PROVIDER)
    profile = attach_profile(db, artist, business_name="The Band")
    service = create_service(db, profile, ServiceType.LIVE_PERFORMANCE)

    booking = create_booking_request(db, client, artist, service)
    create_quote(db, booking, artist, QuoteStatus.ACCEPTED_BY_CLIENT)
    create_message(db, booking, client, "Latest message")

    threads = crud_booking_request.get_booking_requests_with_last_message(
        db,
        client_id=client.id,
        include_relationships=False,
    )

    assert len(threads) == 1
    thread = threads[0]
    assert thread.last_message_content == "Latest message"
    # Quotes should not be hydrated when relationships are skipped
    assert thread.quotes == []
    assert thread.accepted_quote_id is not None
    assert thread.artist_profile.business_name == "The Band"


def test_personalized_video_preview_filters_unpaid_and_formats_payment():
    db = make_session()

    client = create_user(db, "pv-client@example.com", UserType.CLIENT)
    artist = create_user(db, "pv-artist@example.com", UserType.SERVICE_PROVIDER)
    profile = attach_profile(db, artist)
    pv_service = create_service(db, profile, ServiceType.PERSONALIZED_VIDEO)

    paid = create_booking_request(db, client, artist, pv_service)
    unpaid = create_booking_request(db, client, artist, pv_service)

    # Seed messages so the paid thread has a payment receipt
    create_message(
        db,
        paid,
        client,
        "Booking details:\nDate: 2025-01-01",
        message_type=MessageType.SYSTEM,
        system_key="booking_details_v1",
    )
    create_message(
        db,
        paid,
        artist,
        "Payment received order #ABC123",
        message_type=MessageType.SYSTEM,
        system_key="payment_received_v1",
    )

    # Unpaid PV thread should be filtered out
    create_message(
        db,
        unpaid,
        client,
        "Booking details:\nDate: 2025-02-01",
        message_type=MessageType.SYSTEM,
        system_key="booking_details_v1",
    )

    threads = crud_booking_request.get_booking_requests_with_last_message(
        db,
        artist_id=artist.id,
        include_relationships=False,
    )

    assert [t.id for t in threads] == [paid.id]
    thread = threads[0]
    assert thread.last_message_content.startswith("Payment received")
    assert thread._preview_key == "payment_received"


def test_get_unread_counts_for_threads_maps_links():
    db = make_session()

    user = create_user(db, "notify@example.com", UserType.SERVICE_PROVIDER)
    now = datetime.utcnow()

    create_notification(db, user, "/inbox?requestId=10", is_read=False, when=now)
    create_notification(db, user, "/inbox?requestId=10", is_read=False, when=now)
    create_notification(db, user, "/booking-requests/11", is_read=False, when=now)

    counts = crud_notification.get_unread_counts_for_threads(db, user.id)

    assert counts[10] == 2
    assert counts[11] == 1
