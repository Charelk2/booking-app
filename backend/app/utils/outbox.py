from __future__ import annotations

import json
from datetime import datetime, timedelta
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import date
from sqlalchemy import text


logger = logging.getLogger(__name__)


def enqueue_outbox(db: Session, topic: str, payload: dict[str, Any], due_at: Optional[datetime] = None) -> int:
    """Insert an outbox event row for reliable realtime fanout.

    Returns the inserted id (best-effort; 0 if unavailable).
    """
    def _json_default(o: Any):
        try:
            if isinstance(o, (datetime, date)):
                return o.isoformat()
        except Exception:
            pass
        try:
            if isinstance(o, Decimal):
                return float(o)
        except Exception:
            pass
        return str(o)

    try:
        payload_str = json.dumps(payload, default=_json_default, separators=(",", ":"))
    except Exception:
        # Fallback: attempt to coerce
        payload_str = json.dumps({"_error": "non-serializable-payload"})
    try:
        sql = text(
            """
            INSERT INTO outbox_events (topic, payload_json, created_at, delivered_at, attempt_count, last_error, due_at)
            VALUES (:topic, :payload_json, CURRENT_TIMESTAMP, NULL, 0, NULL, :due_at)
            RETURNING id
            """
        )
        res = db.execute(sql, {"topic": topic, "payload_json": payload_str, "due_at": due_at})
        db.commit()
        try:
            rid = res.scalar_one()
            try:
                logger.info("outbox_enqueue topic=%s id=%s bytes=%s", topic, int(rid or 0), len(payload_str))
            except Exception:
                pass
            return int(rid or 0)
        except Exception:
            try:
                logger.info("outbox_enqueue topic=%s id=%s bytes=%s", topic, 0, len(payload_str))
            except Exception:
                pass
            return 0
    except Exception as exc:
        db.rollback()
        try:
            logger.warning("outbox_enqueue_failed topic=%s err=%s", topic, exc)
        except Exception:
            pass
        return 0
