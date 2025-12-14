from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
from typing import Any, Dict, Optional
import os
import logging
import datetime as _dt

from ..database import get_db
from sqlalchemy import text
from .. import models
from .dependencies import get_current_user
from ..utils import r2 as r2utils

router = APIRouter(tags=["payouts"])
logger = logging.getLogger(__name__)

REMIT_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "remittances")
os.makedirs(REMIT_DIR, exist_ok=True)

def _iso(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, (_dt.datetime, _dt.date)):
        # Ensure datetimes are serialized consistently.
        try:
            return v.isoformat()
        except Exception:
            return str(v)
    return str(v)


def _can_view_payout(db: Session, current_user: models.User, payout_id: int) -> bool:
    # Admins can view
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if is_admin:
        return True
    # Providers: must match provider_id on the payout
    try:
        row = db.execute(text("SELECT provider_id FROM payouts WHERE id=:id"), {"id": payout_id}).first()
        if not row:
            return False
        provider_id = int(row[0]) if row[0] is not None else None
        return provider_id == current_user.id
    except Exception:
        return False


@router.get("/me")
def list_my_payouts(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Dict[str, Any]:
    # Providers only.
    if getattr(current_user, "user_type", None) != models.UserType.SERVICE_PROVIDER:
        from ..utils import error_response
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)

    where_sql = "WHERE provider_id = :pid"
    params: Dict[str, Any] = {"pid": int(current_user.id)}

    if status_filter:
        where_sql += " AND LOWER(status) = LOWER(:st)"
        params["st"] = status_filter.strip()

    total = (
        db.execute(text(f"SELECT COUNT(*) FROM payouts {where_sql}"), params).scalar()
        or 0
    )

    rows = db.execute(
        text(
            f"""
            SELECT
              id,
              booking_id,
              amount,
              currency,
              status,
              type,
              scheduled_at,
              paid_at,
              reference
            FROM payouts
            {where_sql}
            ORDER BY COALESCE(paid_at, scheduled_at, created_at) DESC, id DESC
            LIMIT :lim OFFSET :off
            """
        ),
        {**params, "lim": int(limit), "off": int(offset)},
    ).mappings().all()

    items = []
    for r in rows:
        items.append(
            {
                "id": int(r["id"]),
                "booking_id": int(r["booking_id"]) if r["booking_id"] is not None else None,
                "amount": float(r["amount"] or 0),
                "currency": r["currency"] or "ZAR",
                "status": r["status"] or "queued",
                "type": r["type"] or "payout",
                "scheduled_at": _iso(r["scheduled_at"]),
                "paid_at": _iso(r["paid_at"]),
                "reference": r["reference"],
            }
        )

    # Stats (always unfiltered so the dashboard totals remain stable).
    stats_row = db.execute(
        text(
            """
            SELECT
              COALESCE(SUM(CASE WHEN LOWER(status)='paid' THEN amount ELSE 0 END), 0) AS total_paid,
              COALESCE(SUM(CASE WHEN LOWER(status) IN ('queued','blocked') THEN amount ELSE 0 END), 0) AS total_pending,
              COALESCE(SUM(CASE WHEN LOWER(status)='blocked' THEN amount ELSE 0 END), 0) AS total_blocked,
              COALESCE(SUM(CASE WHEN LOWER(status)='failed' THEN amount ELSE 0 END), 0) AS total_failed,
              COALESCE(SUM(CASE WHEN LOWER(status)='queued' THEN amount ELSE 0 END), 0) AS total_queued,
              COALESCE(SUM(CASE WHEN LOWER(status)='queued' THEN 1 ELSE 0 END), 0) AS upcoming_count,
              COALESCE(SUM(CASE WHEN LOWER(status)='blocked' THEN 1 ELSE 0 END), 0) AS blocked_count,
              COALESCE(SUM(CASE WHEN LOWER(status)='failed' THEN 1 ELSE 0 END), 0) AS failed_count,
              MAX(CASE WHEN LOWER(status)='paid' THEN paid_at ELSE NULL END) AS last_payout_at,
              MIN(CASE WHEN LOWER(status)='queued' THEN scheduled_at ELSE NULL END) AS next_payout_at
            FROM payouts
            WHERE provider_id = :pid
            """
        ),
        {"pid": int(current_user.id)},
    ).mappings().first() or {}

    stats = {
        "total_paid": float(stats_row.get("total_paid") or 0),
        "total_pending": float(stats_row.get("total_pending") or 0),
        "total_blocked": float(stats_row.get("total_blocked") or 0),
        "total_failed": float(stats_row.get("total_failed") or 0),
        "total_queued": float(stats_row.get("total_queued") or 0),
        "upcoming_count": int(stats_row.get("upcoming_count") or 0),
        "blocked_count": int(stats_row.get("blocked_count") or 0),
        "failed_count": int(stats_row.get("failed_count") or 0),
        "last_payout_at": _iso(stats_row.get("last_payout_at")),
        "next_payout_at": _iso(stats_row.get("next_payout_at")),
    }

    return {
        "items": items,
        "stats": stats,
        "total": int(total),
        "limit": int(limit),
        "offset": int(offset),
    }


@router.get("/{payout_id}/pdf")
def get_payout_pdf(
    payout_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # AuthZ: provider who owns the payout or admin
    if not _can_view_payout(db, current_user, int(payout_id)):
        from ..utils import error_response
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)

    # Import service lazily
    from ..services import remittance_pdf  # type: ignore

    filename = f"remittance_{payout_id}.pdf"
    path = os.path.abspath(os.path.join(REMIT_DIR, filename))
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        data = remittance_pdf.generate_pdf(db, int(payout_id))
        with open(path, "wb") as fh:
            fh.write(data)
    except Exception:
        # If generation fails, avoid raising PII; return 404
        from ..utils import error_response
        raise error_response("Remittance not available", {}, status.HTTP_404_NOT_FOUND)

    # Prefer R2 presigned inline URL
    try:
        key = r2utils.build_remittance_key(str(payout_id))
        with open(path, "rb") as fh:
            data = fh.read()
        r2utils.put_bytes(key, data, content_type="application/pdf")
        signed = r2utils.presign_get_by_key(key, filename=filename, content_type="application/pdf", inline=True)
        return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception:
        # Fallback to local file
        return FileResponse(path, media_type="application/pdf", filename=filename)
