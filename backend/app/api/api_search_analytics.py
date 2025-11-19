from fastapi import APIRouter, Depends, Request, Query, status
from fastapi.responses import ORJSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Any, List, Optional
import logging
import json

from ..database import get_db
from .dependencies import get_current_user
from ..models.user import User
from ..utils.auth import normalize_email
from .auth import SECRET_KEY, ALGORITHM
from jose import jwt, JWTError

router = APIRouter(tags=["search-analytics"])

logger = logging.getLogger(__name__)


class _SearchEventCreatePayload:
    def __init__(self, data: dict[str, Any]):
        self.search_id: str = str(data.get("search_id", "")).strip()
        self.source: str = str(data.get("source", "")).strip()
        self.category_value: Optional[str] = (
            str(data["category_value"]).strip() if data.get("category_value") else None
        )
        self.location: Optional[str] = (
            str(data["location"]).strip() if data.get("location") else None
        )
        # When is expected as YYYY-MM-DD; store verbatim for DATE column
        self.when: Optional[str] = (
            str(data["when"]).strip() if data.get("when") else None
        )
        self.results_count: Optional[int] = (
            int(data["results_count"]) if data.get("results_count") is not None else None
        )
        self.session_id: Optional[str] = (
            str(data["session_id"]).strip() if data.get("session_id") else None
        )
        self.meta: Optional[dict[str, Any]] = (
            data["meta"] if isinstance(data.get("meta"), dict) else None
        )


def _get_optional_user_id(request: Request, db: Session) -> Optional[int]:
    """Best-effort user resolution from access token cookie or Authorization header.

    This mirrors get_current_user's JWT decode logic but never raises; it is
    used only for analytics so failures are non-fatal.
    """
    token: Optional[str] = None
    auth_header = request.headers.get("authorization") or request.headers.get(
        "Authorization"
    )
    if auth_header and auth_header.lower().startswith("bearer "):
        try:
            token = auth_header.split(" ", 1)[1]
        except Exception:
            token = None
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            return None
    except JWTError:
        return None
    try:
        from ..models.user import User as _User  # local import to avoid cycles

        user = (
            db.query(_User)
            .filter(_User.email == normalize_email(str(email)))
            .first()
        )
        return int(user.id) if user else None
    except Exception:
        return None


@router.post("/search-events", status_code=status.HTTP_202_ACCEPTED)
def log_search_event(request: Request, db: Session = Depends(get_db)):
    """Record a search event for analytics (anonymous or user-linked).

    This endpoint is intentionally unauthenticated; it attempts to infer the
    user from cookies/headers but succeeds even when anonymous.
    """
    try:
        body = request.json()  # type: ignore[attr-defined]
    except Exception:
        # FastAPI will always provide .json() on Request, but guard defensively
        body = {}
    if not isinstance(body, dict):
        body = {}
    payload = _SearchEventCreatePayload(body)
    if not payload.search_id or not payload.source:
        # Missing core identifiers: treat as no-op to avoid noisy rows
        return ORJSONResponse({"status": "ignored"}, status_code=status.HTTP_202_ACCEPTED)

    try:
        user_id = _get_optional_user_id(request, db)
    except Exception:
        user_id = None

    params: dict[str, Any] = {
        "user_id": user_id,
        "session_id": payload.session_id,
        "source": payload.source,
        "category_value": payload.category_value,
        "location": payload.location,
        "when_date": payload.when,
        "results_count": payload.results_count,
        "search_id": payload.search_id,
        "meta": json.dumps(payload.meta) if payload.meta is not None else None,
    }
    try:
        db.execute(
            text(
                """
                INSERT INTO search_events (
                  created_at,
                  user_id,
                  session_id,
                  source,
                  category_value,
                  location,
                  when_date,
                  results_count,
                  search_id,
                  clicked_artist_id,
                  click_rank,
                  meta
                )
                VALUES (
                  CURRENT_TIMESTAMP,
                  :user_id,
                  :session_id,
                  :source,
                  :category_value,
                  :location,
                  :when_date,
                  :results_count,
                  :search_id,
                  NULL,
                  NULL,
                  :meta
                )
                """
            ),
            params,
        )
        db.commit()
    except Exception as exc:  # pragma: no cover - best-effort logging only
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning("search-events insert failed: %s", exc)
    return {"status": "ok"}


@router.post("/search-events/click", status_code=status.HTTP_202_ACCEPTED)
def log_search_click(request: Request, db: Session = Depends(get_db)):
    """Record a click on a search result for analytics."""
    try:
        body = request.json()  # type: ignore[attr-defined]
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    search_id = str(body.get("search_id") or "").strip()
    artist_id_raw = body.get("artist_id")
    rank_raw = body.get("rank")
    try:
        artist_id = int(artist_id_raw)
    except Exception:
        artist_id = None
    try:
        rank = int(rank_raw) if rank_raw is not None else None
    except Exception:
        rank = None

    if not search_id or artist_id is None:
        return ORJSONResponse({"status": "ignored"}, status_code=status.HTTP_202_ACCEPTED)

    try:
        row = db.execute(
            text(
                """
                SELECT id FROM search_events
                WHERE search_id = :sid
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {"sid": search_id},
        ).fetchone()
        if row:
            db.execute(
                text(
                    """
                    UPDATE search_events
                    SET clicked_artist_id = :artist_id,
                        click_rank = :click_rank
                    WHERE id = :id
                    """
                ),
                {
                    "artist_id": artist_id,
                    "click_rank": rank,
                    "id": row[0],
                },
            )
            db.commit()
    except Exception as exc:  # pragma: no cover - best-effort only
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning("search-events click update failed: %s", exc)
    return {"status": "ok"}


@router.get("/search/suggestions/locations")
def get_popular_locations(limit: int = Query(default=10, ge=1, le=50), db: Session = Depends(get_db)):
    """Return popular search locations derived from search_events.

    Currently aggregates over all history. We can later constrain by a recent
    window (e.g. last 90 days) with a small dialect-aware adjustment.
    """
    try:
        rows = db.execute(
            text(
                """
                SELECT location, COUNT(*) AS c
                FROM search_events
                WHERE location IS NOT NULL AND trim(location) != ''
                GROUP BY location
                ORDER BY c DESC
                LIMIT :limit
                """
            ),
            {"limit": int(limit)},
        ).fetchall()
    except Exception as exc:  # pragma: no cover
        logger.warning("popular locations query failed: %s", exc)
        rows = []

    items = [
        {"name": row[0], "count": int(row[1])}
        for row in rows
        if row[0] is not None
    ]
    return items


@router.get("/search/history")
def get_search_history(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent search events for the authenticated user."""
    try:
        rows = db.execute(
            text(
                """
                SELECT
                  category_value,
                  location,
                  when_date,
                  created_at
                FROM search_events
                WHERE user_id = :uid
                  AND (category_value IS NOT NULL OR location IS NOT NULL OR when_date IS NOT NULL)
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            {"uid": int(current_user.id), "limit": int(limit)},
        ).fetchall()
    except Exception as exc:  # pragma: no cover
        logger.warning("search history query failed: %s", exc)
        rows = []

    history: List[dict[str, Any]] = []
    for row in rows:
        category_value, location, when_date, created_at = row
        when_str: Optional[str] = None
        try:
            if when_date is not None:
                # when_date may be a date/datetime or a plain string depending on dialect
                if hasattr(when_date, "isoformat"):
                    when_str = when_date.isoformat()
                else:
                    when_str = str(when_date)
        except Exception:
            when_str = None
        created_str: str
        try:
            if hasattr(created_at, "isoformat"):
                created_str = created_at.isoformat()
            else:
                created_str = str(created_at)
        except Exception:
            created_str = ""

        history.append(
            {
                "category_value": category_value,
                "location": location,
                "when": when_str,
                "created_at": created_str,
            }
        )
    return history

