from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime

from .base import BaseModel


class AdminUser(BaseModel):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    role = Column(String, nullable=False, default="admin")  # support|payments|trust|content|admin|superadmin
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_admin_users_user_id"),
    )

