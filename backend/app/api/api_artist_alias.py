from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.v1 import api_service_provider as sp

router = APIRouter(tags=["artists-compat"])


@router.get("/artists/{artist_id}/availability")
def artist_availability_compat(
    artist_id: int,
    by: Optional[date] = Query(None, description="Date to check (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """
    Compatibility alias for legacy frontend calls:
    GET /api/v1/artists/{artist_id}/availability?by=YYYY-MM-DD

    Bridges to the canonical endpoint under
    /api/v1/service-provider-profiles/{artist_id}/availability.

    Response shape matches the lightweight checker used by the personalized
    video flow:
      { "capacity_ok": true, "blackout": false }
    where blackout == true if the selected date is unavailable.
    """
    # Delegate to the canonical handler to compute unavailable dates.
    res = sp.read_artist_availability(artist_id, when=by, db=db)
    unavailable = set((res or {}).get("unavailable_dates", []) if isinstance(res, dict) else [])
    blackout = False
    if by:
        try:
            blackout = by.isoformat() in unavailable
        except Exception:
            blackout = False
    return {"capacity_ok": True, "blackout": blackout}

