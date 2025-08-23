import re
from typing import Optional

from app.models.service_provider_profile import ServiceProviderProfile


def _nonempty(val: Optional[str]) -> bool:
    return bool(val and str(val).strip())


def _valid_email(val: Optional[str]) -> bool:
    return bool(val and re.match(r"[^@]+@[^@]+\.[^@]+", val))


def _valid_za_phone(val: Optional[str]) -> bool:
    return bool(val and re.match(r"^\+27\d{9}$", val))


def _likely_url(val: Optional[str]) -> bool:
    return bool(val and re.match(r"^(https?://)?[\w.-]+\.[A-Za-z]{2,}", val))


def is_artist_profile_complete(artist: ServiceProviderProfile) -> bool:
    """Return True when an artist profile is considered complete for onboarding.

    Bank details are EXCLUDED from this rule per product requirement. The
    following are required:
    - business_name
    - description
    - location
    - contact_email (looks like an email)
    - contact_phone (South Africa format +27XXXXXXXXX)
    - contact_website (looks like a URL)
    - specialties (at least one)
    - cancellation_policy (optional, but included when available on model)
    """
    has_business = _nonempty(artist.business_name)
    has_desc = _nonempty(artist.description)
    has_location = _nonempty(artist.location)
    has_email = _valid_email(getattr(artist, "contact_email", None))
    has_phone = _valid_za_phone(getattr(artist, "contact_phone", None))
    has_website = _likely_url(getattr(artist, "contact_website", None))
    specialties = getattr(artist, "specialties", None) or []
    has_specialties = isinstance(specialties, list) and any(bool(s) for s in specialties)
    # cancellation_policy exists on newer schemas; treat missing attr as optional
    policy_val = getattr(artist, "cancellation_policy", None)
    has_policy = True if policy_val is None else _nonempty(policy_val)

    return all([
        has_business,
        has_desc,
        has_location,
        has_email,
        has_phone,
        has_website,
        has_specialties,
        has_policy,
    ])

