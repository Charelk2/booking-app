from __future__ import annotations

import os
from sqlalchemy.orm import Session
from sqlalchemy import inspect
from typing import Optional

from ..database import SessionLocal
from ..models import AdminUser, User, UserType
from ..utils.auth import get_password_hash, normalize_email


DEFAULT_EMAIL = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@booka.co.za")
DEFAULT_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "1111")
DEFAULT_ROLE = os.getenv("DEFAULT_ADMIN_ROLE", "superadmin")


def _table_exists(session: Session, table_name: str) -> bool:
    insp = inspect(session.get_bind())
    return table_name in insp.get_table_names()


def ensure_default_admin() -> Optional[AdminUser]:
    """Create a default superadmin if none exists and bootstrap is enabled.

    Controlled by env var DEFAULT_ADMIN_BOOTSTRAP ("1" by default). Set to
    "0" in production once you've created proper admin users.
    """
    if os.getenv("DEFAULT_ADMIN_BOOTSTRAP", "1") not in ("1", "true", "TRUE", "yes", "on"):
        return None

    session: Session = SessionLocal()
    try:
        # Ensure table present and no admins exist
        if not _table_exists(session, "admin_users"):
            return None
        existing = session.query(AdminUser).count()
        if existing > 0:
            return None

        # Create or reuse a backing User
        email = normalize_email(DEFAULT_EMAIL)
        user = session.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                password=get_password_hash(DEFAULT_PASSWORD),
                first_name="Admin",
                last_name="User",
                user_type=UserType.CLIENT,
                is_verified=True,
            )
            session.add(user)
            session.commit()
            session.refresh(user)

        admin = AdminUser(user_id=user.id, email=user.email, role=DEFAULT_ROLE)
        session.add(admin)
        session.commit()
        session.refresh(admin)
        return admin
    except Exception:
        session.rollback()
        return None
    finally:
        session.close()
