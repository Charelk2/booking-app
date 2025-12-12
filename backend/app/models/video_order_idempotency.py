from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from .base import BaseModel


class VideoOrderIdempotency(BaseModel):
    """Idempotency mapping for PV v2 create.

    Best-effort table: prod may not have this until manual DDL is applied.
    """

    __tablename__ = "video_order_idempotency"
    __table_args__ = (
        UniqueConstraint("user_id", "key_hash", name="uq_video_order_idem_user_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key_hash = Column(String, nullable=False)
    request_hash = Column(String, nullable=True)
    booking_request_id = Column(
        Integer,
        ForeignKey("booking_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    booking_request = relationship("BookingRequest")
    user = relationship("User")

