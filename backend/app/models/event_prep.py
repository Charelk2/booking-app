from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    ForeignKey,
    UniqueConstraint,
    Numeric,
    Time,
)
from sqlalchemy.orm import relationship
from .base import BaseModel


class EventPrep(BaseModel):
    __tablename__ = "event_preps"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_event_preps_booking_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(
        Integer,
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True,
    )

    day_of_contact_name = Column(String, nullable=True)
    day_of_contact_phone = Column(String, nullable=True)

    venue_address = Column(String, nullable=True)
    venue_place_id = Column(String, nullable=True)
    venue_lat = Column(Numeric(12, 6), nullable=True)
    venue_lng = Column(Numeric(12, 6), nullable=True)

    loadin_start = Column(Time, nullable=True)
    loadin_end = Column(Time, nullable=True)

    # Additional schedule fields
    soundcheck_time = Column(Time, nullable=True)
    guests_arrival_time = Column(Time, nullable=True)
    performance_start_time = Column(Time, nullable=True)
    performance_end_time = Column(Time, nullable=True)

    # 'venue' | 'artist' — default 'venue'
    tech_owner = Column(String, nullable=False, default="venue")

    stage_power_confirmed = Column(Boolean, nullable=False, default=False)

    accommodation_required = Column(Boolean, nullable=False, default=False)
    accommodation_address = Column(String, nullable=True)
    accommodation_contact = Column(String, nullable=True)
    accommodation_notes = Column(String, nullable=True)

    notes = Column(String, nullable=True)
    # Separate notes for the Schedule section
    schedule_notes = Column(String, nullable=True)
    # Separate notes for parking & access (Location section)
    parking_access_notes = Column(String, nullable=True)

    # Cached int for quick progress bars; server recomputes on reads/writes
    progress_cached = Column(Integer, nullable=False, default=0)

    # Optional audit — not required by contract; kept nullable
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    booking = relationship("Booking")


class EventPrepAttachment(BaseModel):
    __tablename__ = "event_prep_attachments"

    id = Column(Integer, primary_key=True, index=True)
    event_prep_id = Column(Integer, ForeignKey("event_preps.id", ondelete="CASCADE"), nullable=False, index=True)
    file_url = Column(String, nullable=False)

    event_prep = relationship("EventPrep")


class EventPrepIdempotency(BaseModel):
    __tablename__ = "event_prep_idempotency"
    __table_args__ = (
        UniqueConstraint("booking_id", "key_hash", name="uq_event_prep_idem_booking_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    key_hash = Column(String, nullable=False)
    request_hash = Column(String, nullable=True)
