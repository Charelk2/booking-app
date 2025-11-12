# backend/app/models/service_provider_profile.py

from sqlalchemy import (
    Column,
    String,
    Text,
    Numeric,
    ForeignKey,
    JSON,
    Integer,
    Boolean,
)
from sqlalchemy.orm import relationship

from .base import BaseModel      # ← import BaseModel directly


class ServiceProviderProfile(BaseModel):
    """ORM model representing a service provider's profile."""

    __tablename__ = "service_provider_profiles"

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        unique=True,
        nullable=False,
        index=True,
    )
    business_name = Column(String, index=True, nullable=True)
    custom_subtitle = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    hourly_rate = Column(Numeric(10, 2), nullable=True)
    portfolio_urls = Column(JSON, nullable=True)
    portfolio_image_urls = Column(JSON, nullable=True)
    specialties = Column(JSON, nullable=True)
    profile_picture_url = Column(String, nullable=True)
    cover_photo_url = Column(String, nullable=True)
    price_visible = Column(Boolean, nullable=False, default=True)
    # Optional cancellation policy text (displayed to clients)
    cancellation_policy = Column(Text, nullable=True)
    # Onboarding/completion flag to gate adding services until profile is complete
    onboarding_completed = Column(Boolean, nullable=False, default=False)

    # Optional contact details shared with clients upon booking confirmation
    contact_email = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)
    contact_website = Column(String, nullable=True)

    # Optional banking details (for payouts/invoices)
    bank_name = Column(String, nullable=True)
    bank_account_name = Column(String, nullable=True)
    bank_account_number = Column(String, nullable=True)
    bank_branch_code = Column(String, nullable=True)

    # Business & VAT details (agent invoicing)
    legal_name = Column(String, nullable=True)
    trading_name = Column(String, nullable=True)
    billing_address_line1 = Column(String, nullable=True)
    billing_address_line2 = Column(String, nullable=True)
    billing_city = Column(String, nullable=True)
    billing_region = Column(String, nullable=True)
    billing_postal_code = Column(String, nullable=True)
    billing_country = Column(String, nullable=True)
    invoice_email = Column(String, nullable=True)
    vat_registered = Column(Boolean, nullable=True)
    vat_number = Column(String, nullable=True)
    vat_rate = Column(Numeric(5, 4), nullable=True)
    agent_invoicing_consent = Column(Boolean, nullable=True)
    agent_invoicing_consent_date = Column(String, nullable=True)

    # Relationships
    user = relationship("User", back_populates="artist_profile")
    services = relationship(
        "Service",
        back_populates="artist",
        cascade="all, delete-orphan",
    )
    bookings = relationship(
        "Booking",
        back_populates="artist",
        cascade="all, delete-orphan",
    )
    reviews = relationship(
        "Review",
        back_populates="artist",
        cascade="all, delete-orphan",
    )
