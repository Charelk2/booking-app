# backend/app/schemas/user.py

from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum


class UserType(str, Enum):
    ARTIST = "artist"
    CLIENT = "client"


class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    phone_number: Optional[str]
    user_type: UserType


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


class MFACode(BaseModel):
    code: str


class EmailConfirmRequest(BaseModel):
    token: str

