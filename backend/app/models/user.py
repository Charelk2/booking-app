# backend/app/models/user.py

from sqlalchemy import Boolean, Column, Integer, String, Enum, DateTime
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum

class UserType(str, enum.Enum):
    """Enumeration of all supported user roles."""

    SERVICE_PROVIDER = "service_provider"
    CLIENT = "client"

    @classmethod
    def _missing_(cls, value: object):
        """Map legacy enum values to current ones."""
        if isinstance(value, str) and value.upper() == "ARTIST":
            return cls.SERVICE_PROVIDER
        return None

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
    # Session/refresh token hardening
    refresh_token_hash = Column(String, nullable=True)
    refresh_token_expires_at = Column(DateTime, nullable=True)

    # ↔–↔ If this user is a service provider, they get exactly one profile here:
    artist_profile = relationship(
        "ServiceProviderProfile",
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

    # Per-session refresh model (new). Keep legacy columns for shim.
    sessions = relationship(
        "Session",
        back_populates="user",
        cascade="all, delete-orphan",
    )

# Ensure the Session model is registered with SQLAlchemy metadata even in test
# environments that only import this module before calling create_all().
try:
    from . import session as _session  # noqa: F401
except Exception:
    pass
