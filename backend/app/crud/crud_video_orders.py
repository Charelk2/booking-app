from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from .. import models

logger = logging.getLogger(__name__)


def idempotency_lookup(
    db: Session, user_id: int, key: Optional[str]
) -> Optional[int]:
    """Return existing booking_request_id for (user_id, key) within 24h."""
    if not key:
        return None
    key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
    try:
        existing = (
            db.query(models.VideoOrderIdempotency)
            .filter(models.VideoOrderIdempotency.user_id == user_id)
            .filter(models.VideoOrderIdempotency.key_hash == key_hash)
            .first()
        )
    except Exception as exc:
        # Table may not exist yet in prod; treat as no-op.
        logger.warning("VideoOrder idempotency lookup failed: %s", exc)
        return None
    if not existing:
        return None
    try:
        if (datetime.utcnow() - existing.created_at) <= timedelta(hours=24):
            return int(existing.booking_request_id)
    except Exception:
        return int(existing.booking_request_id)
    return None


def record_idempotency(
    db: Session,
    user_id: int,
    key: Optional[str],
    booking_request_id: int,
    request_hash: Optional[str] = None,
) -> None:
    """Record an idempotency mapping for future lookups."""
    if not key:
        return
    key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
    try:
        idem = models.VideoOrderIdempotency(
            user_id=user_id,
            key_hash=key_hash,
            request_hash=(
                hashlib.sha256(request_hash.encode("utf-8")).hexdigest()
                if request_hash
                else None
            ),
            booking_request_id=booking_request_id,
        )
        db.add(idem)
        db.commit()
    except Exception as exc:
        logger.warning("VideoOrder idempotency record failed: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass

