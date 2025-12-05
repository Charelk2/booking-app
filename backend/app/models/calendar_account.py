import enum
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship

from .base import BaseModel
from .types import CaseInsensitiveEnum


class CalendarProvider(str, enum.Enum):
    GOOGLE = "google"


class CalendarAccount(BaseModel):
    __tablename__ = "calendar_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(
        CaseInsensitiveEnum(CalendarProvider, name="calendarprovider"),
        nullable=False,
        index=True,
    )
    refresh_token = Column(String, nullable=False)
    access_token = Column(String, nullable=False)
    token_expiry = Column(DateTime, nullable=False)
    email = Column(String, nullable=True)
    # Connection health metadata:
    # - status: "ok" (default), "error", or "needs_reauth" when Google rejects refresh.
    # - last_error: optional human-readable description for ops debugging.
    # - last_error_at / last_success_sync_at: timestamps to track calendar health.
    status = Column(String, nullable=True)
    last_error = Column(Text, nullable=True)
    last_error_at = Column(DateTime, nullable=True)
    last_success_sync_at = Column(DateTime, nullable=True)

    user = relationship("User", backref="calendar_accounts")
