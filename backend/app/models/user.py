# backend/app/models/user.py

from sqlalchemy import Boolean, Column, Integer, String, Enum
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum

class UserType(str, enum.Enum):
    ARTIST = "artist"
    CLIENT = "client"

class User(BaseModel):
    __tablename__ = "users"

    id           = Column(Integer, primary_key=True, index=True)
    email        = Column(String, unique=True, index=True, nullable=False)
    password     = Column(String, nullable=False)
    first_name   = Column(String, nullable=False)
    last_name    = Column(String, nullable=False)
    phone_number = Column(String, nullable=True)
    user_type    = Column(Enum(UserType), nullable=False)
    is_active    = Column(Boolean, default=True)
    is_verified  = Column(Boolean, default=False)
    mfa_secret   = Column(String, nullable=True)
    mfa_enabled  = Column(Boolean, default=False)
    mfa_recovery_tokens = Column(String, nullable=True)
    profile_picture_url = Column(String, nullable=True)

    # ↔–↔ If this user is an artist, they get exactly one profile here:
    artist_profile = relationship(
        "ArtistProfileV2",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )

    # ↔–↔ All bookings where this user is the client
    bookings_as_client = relationship(
        "Booking",
        foreign_keys="Booking.client_id",
        back_populates="client",
        cascade="all, delete-orphan"
    )

    # ↔–↔ BookingRequest, Quote, Review, etc. → if you have them, put similar back_populates here.
    booking_requests_as_client = relationship(
        "BookingRequest",
        foreign_keys="BookingRequest.client_id",
        back_populates="client",
        cascade="all, delete-orphan"
    )
    booking_requests_as_artist = relationship(
        "BookingRequest",
        foreign_keys="BookingRequest.artist_id",
        back_populates="artist",
        cascade="all, delete-orphan"
    )
