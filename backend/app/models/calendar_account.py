import enum
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship

from .base import BaseModel


class CalendarProvider(str, enum.Enum):
    GOOGLE = "google"


class CalendarAccount(BaseModel):
    __tablename__ = "calendar_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(Enum(CalendarProvider), nullable=False, index=True)
    refresh_token = Column(String, nullable=False)
    access_token = Column(String, nullable=False)
    token_expiry = Column(DateTime, nullable=False)
    email = Column(String, nullable=True)

    user = relationship("User", backref="calendar_accounts")

