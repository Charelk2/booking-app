from fastapi import APIRouter, Depends, Request, Query, status
from fastapi.responses import ORJSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Any, List, Optional, Dict
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
async def log_search_event(request: Request, db: Session = Depends(get_db)):
    """Record a search event for analytics (anonymous or user-linked).

    This endpoint is intentionally unauthenticated; it attempts to infer the
    user from cookies/headers but succeeds even when anonymous.
    """
    try:
        body = await request.json()
    except Exception:
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
async def log_search_click(request: Request, db: Session = Depends(get_db)):
    """Record a click on a search result for analytics."""
    try:
        body = await request.json()
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


@router.get("/search-analytics/summary")
def get_search_analytics_summary(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return aggregated search analytics for dashboards.

    Includes:
    - All-time totals (searches, clicks, unique sessions, unique users)
    - Searches by source
    - Top locations (by searches + clicks)
    - Top categories (by searches + clicks)
    """
    # Totals
    try:
      total_searches = db.execute(
          text("SELECT COUNT(*) FROM search_events")
      ).scalar() or 0

      total_clicks = db.execute(
          text("SELECT COUNT(*) FROM search_events WHERE clicked_artist_id IS NOT NULL")
      ).scalar() or 0

      unique_sessions = db.execute(
          text(
              """
              SELECT COUNT(DISTINCT session_id)
              FROM search_events
              WHERE session_id IS NOT NULL AND TRIM(session_id) != ''
              """
          )
      ).scalar() or 0

      unique_users = db.execute(
          text(
              """
              SELECT COUNT(DISTINCT user_id)
              FROM search_events
              WHERE user_id IS NOT NULL
              """
          )
      ).scalar() or 0
    except Exception as exc:  # pragma: no cover - defensive
      logger.warning("search summary totals query failed: %s", exc)
      total_searches = total_clicks = unique_sessions = unique_users = 0

    totals = {
        "searches": int(total_searches),
        "clicks": int(total_clicks),
        "unique_sessions": int(unique_sessions),
        "unique_users": int(unique_users),
    }

    # By source
    try:
        source_rows = db.execute(
            text(
                """
                SELECT source, COUNT(*) AS c
                FROM search_events
                GROUP BY source
                ORDER BY c DESC
                """
            )
        ).fetchall()
    except Exception as exc:  # pragma: no cover
        logger.warning("search summary by_source query failed: %s", exc)
        source_rows = []

    by_source: List[Dict[str, Any]] = [
        {"source": row[0] or "", "searches": int(row[1] or 0)}
        for row in source_rows
        if row[0] is not None
    ]

    # Top locations
    try:
        loc_rows = db.execute(
            text(
                """
                SELECT
                  location,
                  COUNT(*) AS searches,
                  SUM(CASE WHEN clicked_artist_id IS NOT NULL THEN 1 ELSE 0 END) AS clicks
                FROM search_events
                WHERE location IS NOT NULL AND TRIM(location) != ''
                GROUP BY location
                ORDER BY searches DESC
                LIMIT :limit
                """
            ),
            {"limit": int(limit)},
        ).fetchall()
    except Exception as exc:  # pragma: no cover
        logger.warning("search summary locations query failed: %s", exc)
        loc_rows = []

    top_locations: List[Dict[str, Any]] = [
        {
            "location": row[0] or "",
            "searches": int(row[1] or 0),
            "clicks": int(row[2] or 0),
        }
        for row in loc_rows
        if row[0] is not None
    ]

    # Top categories
    try:
        cat_rows = db.execute(
            text(
                """
                SELECT
                  category_value,
                  COUNT(*) AS searches,
                  SUM(CASE WHEN clicked_artist_id IS NOT NULL THEN 1 ELSE 0 END) AS clicks
                FROM search_events
                WHERE category_value IS NOT NULL AND TRIM(category_value) != ''
                GROUP BY category_value
                ORDER BY searches DESC
                LIMIT :limit
                """
            ),
            {"limit": int(limit)},
        ).fetchall()
    except Exception as exc:  # pragma: no cover
        logger.warning("search summary categories query failed: %s", exc)
        cat_rows = []

    top_categories: List[Dict[str, Any]] = [
        {
            "category_value": row[0] or "",
            "searches": int(row[1] or 0),
            "clicks": int(row[2] or 0),
        }
        for row in cat_rows
        if row[0] is not None
    ]

    return {
        "totals": totals,
        "by_source": by_source,
        "top_locations": top_locations,
        "top_categories": top_categories,
    }


@router.get("/search-analytics/problem-queries")
def get_search_problem_queries(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return category/location pairs that frequently yield zero results."""
    try:
        rows = db.execute(
            text(
                """
                SELECT
                  COALESCE(category_value, '') AS category_value,
                  COALESCE(location, '') AS location,
                  COUNT(*) AS total_searches,
                  SUM(CASE WHEN results_count = 0 OR results_count IS NULL THEN 1 ELSE 0 END) AS zero_result_count
                FROM search_events
                GROUP BY COALESCE(category_value, ''), COALESCE(location, '')
                HAVING SUM(CASE WHEN results_count = 0 OR results_count IS NULL THEN 1 ELSE 0 END) > 0
                ORDER BY zero_result_count DESC, total_searches DESC
                LIMIT :limit
                """
            ),
            {"limit": int(limit)},
        ).fetchall()
    except Exception as exc:  # pragma: no cover
        logger.warning("search problem-queries query failed: %s", exc)
        rows = []

    items: List[Dict[str, Any]] = []
    for row in rows:
        category_value, location, total_searches, zero_result_count = row
        try:
            total = int(total_searches or 0)
            zero = int(zero_result_count or 0)
            rate = float(zero) / float(total) if total > 0 else 0.0
        except Exception:
            total = 0
            zero = 0
            rate = 0.0
        items.append(
            {
                "category_value": category_value or None,
                "location": location or None,
                "total_searches": total,
                "zero_result_count": zero,
                "zero_result_rate": rate,
            }
        )
    return items
