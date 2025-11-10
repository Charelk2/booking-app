from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from .base import BaseModel


class Session(BaseModel):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Rotating refresh token (hash only) + metadata
    refresh_token_hash = Column(String(128), nullable=True)
    refresh_token_expires_at = Column(DateTime, nullable=True)
    refresh_jti = Column(String(64), nullable=True)

    # Previous token hash for DB-only idempotency when Redis is unavailable
    prev_refresh_token_hash = Column(String(128), nullable=True)
    prev_rotated_at = Column(DateTime, nullable=True)

    # Lifecycle / diagnostics
    revoked_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")


Index("ix_sessions_user_id", Session.user_id)
Index("ix_sessions_refresh_jti", Session.refresh_jti, unique=True)
Index("ix_sessions_refresh_hash", Session.refresh_token_hash)
Index("ix_sessions_revoked_at", Session.revoked_at)

