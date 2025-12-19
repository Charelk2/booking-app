# backend/app/schemas/user.py

from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum


class UserType(str, Enum):
    """Roles supported by the API."""

    SERVICE_PROVIDER = "service_provider"
    CLIENT = "client"

    @classmethod
    def _missing_(cls, value: object):
        """Map legacy enum values to current ones."""
        if isinstance(value, str) and value.upper() == "ARTIST":
            return cls.SERVICE_PROVIDER
        return None


class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    phone_number: Optional[str]
    organization: Optional[str] = None
    job_title: Optional[str] = None
    marketing_opt_in: bool = False
    # Make role optional for requests; default to 'client' if not provided.
    # Response models will still include the concrete value from the DB.
    user_type: UserType = UserType.CLIENT


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int
    is_active: bool
    is_verified: bool
    mfa_enabled: bool
    profile_picture_url: str | None = None

    model_config = {
        "from_attributes": True
    }


# TokenData for extracting “sub” (email) from JWT
class TokenData(BaseModel):
    email: Optional[str] = None


class MFAVerify(BaseModel):
    token: str
    code: str
    # Optional: trust this device for 30 days and a caller-provided device id
    trustedDevice: bool | None = None
    deviceId: str | None = None


class MFACode(BaseModel):
    code: str


class EmailConfirmRequest(BaseModel):
    token: str
