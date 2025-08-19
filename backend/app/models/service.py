# backend/app/models/service.py
from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    ForeignKey,
    Text,
    Enum as SQLAlchemyEnum,
    JSON,
)
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum


class ServiceType(str, enum.Enum):
    """Allowed service categories."""

    LIVE_PERFORMANCE = "Live Performance"
    VIRTUAL_APPEARANCE = "Virtual Appearance"
    PERSONALIZED_VIDEO = "Personalized Video"
    CUSTOM_SONG = "Custom Song"
    OTHER = "Other"


class Service(BaseModel):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    artist_id = Column(
        Integer,
        ForeignKey("service_provider_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    media_url = Column(String, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="ZAR")
    duration_minutes = Column(Integer, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    service_type = Column(
        SQLAlchemyEnum(
            ServiceType,
            values_callable=lambda enum: [e.value for e in enum],
            native_enum=False,
        ),
        nullable=False,
        default=ServiceType.LIVE_PERFORMANCE,
    )

    # Link to predefined service categories
    service_category_id = Column(
        Integer, ForeignKey("service_categories.id", ondelete="SET NULL"), nullable=True
    )
    # JSON blob for category-specific attributes, e.g., genres for musicians
    details = Column(JSON, nullable=True)
    service_category = relationship("ServiceCategory")

    # New travel fields so quotes can accurately reflect costs
    travel_rate = Column(Numeric(10, 2), nullable=True, default=2.5)
    travel_members = Column(Integer, nullable=True, default=1)
    # Additional optional travel cost inputs provided by artists
    car_rental_price = Column(Numeric(10, 2), nullable=True)
    flight_price = Column(Numeric(10, 2), nullable=True)
    # Optional markup percent when artist manages external sound supplier
    sound_managed_markup_percent = Column(Numeric(6, 2), nullable=True)

    # Link back to the ServiceProviderProfile
    artist = relationship("ServiceProviderProfile", back_populates="services")

    # ← Here’s the missing piece:
    booking_requests = relationship(
        "BookingRequest",
        back_populates="service",
        cascade="all, delete-orphan",
    )

    # If you also want to link Booking → Service:
    bookings = relationship(
        "Booking", back_populates="service", cascade="all, delete-orphan"
    )

    # If you have a Review model that references Service:
    reviews = relationship(
        "Review", back_populates="service", cascade="all, delete-orphan"
    )
