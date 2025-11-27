from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import User, UserType, BookingStatus, BookingRequest
from app.models.base import BaseModel
from app.schemas.booking_agent import BookingAgentState
from app.services.booking_agent import run_booking_agent_step


def setup_db():
  engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
  BaseModel.metadata.create_all(engine)
  Session = sessionmaker(bind=engine, expire_on_commit=False)
  return Session()


def _msg(role: str, content: str) -> dict:
  return {"role": role, "content": content}


def test_agent_does_not_book_when_unavailable():
  """When availability_status is 'unavailable', the agent must not create a booking."""
  db = setup_db()
  client = User(
    email="client@example.com",
    password="x",
    first_name="Client",
    last_name="User",
    user_type=UserType.CLIENT,
  )
  artist = User(
    email="artist@example.com",
    password="x",
    first_name="Artist",
    last_name="User",
    user_type=UserType.SERVICE_PROVIDER,
  )
  db.add_all([client, artist])
  db.commit()
  db.refresh(client)
  db.refresh(artist)

  state = BookingAgentState(
    chosen_provider_id=artist.id,
    chosen_provider_name="Test Artist",
    date="2030-01-15",
    city="Cape Town",
    availability_checked=True,
    availability_status="unavailable",
    stage="awaiting_confirmation",
  )
  messages = [
    _msg("user", "I want to book Test Artist in Cape Town on 2030-01-15"),
    _msg("assistant", "It looks like they are booked that day."),
    _msg("user", "yes please book"),  # should not book because unavailable
  ]

  step = run_booking_agent_step(
    db=db,
    current_user=client,
    messages=messages,
    state=state,
  )

  assert step.final_action is None
  existing = (
    db.query(BookingRequest)
    .filter(
      BookingRequest.client_id == client.id,
      BookingRequest.artist_id == artist.id,
      BookingRequest.status.in_([BookingStatus.DRAFT, BookingStatus.PENDING_QUOTE]),
    )
    .all()
  )
  assert existing == []


def test_agent_booking_is_idempotent_for_same_client_artist_date():
  """Confirming twice for the same client/artist/date reuses the existing booking request."""
  db = setup_db()
  client = User(
    email="client2@example.com",
    password="x",
    first_name="Client",
    last_name="User",
    user_type=UserType.CLIENT,
  )
  artist = User(
    email="artist2@example.com",
    password="x",
    first_name="Artist",
    last_name="User",
    user_type=UserType.SERVICE_PROVIDER,
  )
  db.add_all([client, artist])
  db.commit()
  db.refresh(client)
  db.refresh(artist)

  # Seed an existing booking request for this client/artist/date.
  seeded = BookingRequest(
    client_id=client.id,
    artist_id=artist.id,
    service_id=None,
    message="Seeded booking",
    proposed_datetime_1=datetime(2031, 5, 10, 12, 0, 0),
    status=BookingStatus.PENDING_QUOTE,
  )
  db.add(seeded)
  db.commit()
  db.refresh(seeded)

  state = BookingAgentState(
    chosen_provider_id=artist.id,
    chosen_provider_name="Test Artist",
    date="2031-05-10",
    city="Cape Town",
    availability_checked=True,
    availability_status="available",
    stage="awaiting_confirmation",
  )
  messages = [
    _msg("user", "I'd like to book Test Artist in Cape Town on 10 May 2031"),
    _msg("assistant", "I can create a booking request for that date."),
    _msg("user", "yes please book"),  # should reuse existing booking request
  ]

  step = run_booking_agent_step(
    db=db,
    current_user=client,
    messages=messages,
    state=state,
  )

  assert step.final_action is not None
  assert step.final_action.get("type") == "booking_created"
  reused_id = int(step.final_action.get("booking_request_id") or 0)
  assert reused_id == seeded.id

  all_reqs = (
    db.query(BookingRequest)
    .filter(
      BookingRequest.client_id == client.id,
      BookingRequest.artist_id == artist.id,
    )
    .all()
  )
  assert len(all_reqs) == 1

