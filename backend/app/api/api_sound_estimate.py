from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from .. import crud
from ..utils import error_response
from ..schemas.sound_estimate import SoundEstimateIn, SoundEstimateOut
from app.service_types.sound_service import estimate_sound_service


# Legacy compatibility router.
#
# New clients should prefer the service-typed estimate endpoint exposed under
# `/api/v1/quotes/estimate/sound` in :mod:`app.api.api_quote`, which calls the
# same sound-service engine. This module remains to support older consumers
# that are bound to `/services/{service_id}/sound-estimate`.
router = APIRouter(tags=["sound-estimate"])


@router.post("/services/{service_id}/sound-estimate", response_model=SoundEstimateOut)
def sound_estimate(service_id: int, body: SoundEstimateIn, db: Session = Depends(get_db)):
    svc = crud.service.get_service(db, service_id)
    if not svc:
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    payload = estimate_sound_service(
        svc.details or {},
        guest_count=int(body.guest_count or 0),
        venue_type=body.venue_type,
        stage_required=bool(body.stage_required),
        stage_size=body.stage_size,
        lighting_evening=bool(body.lighting_evening),
        upgrade_lighting_advanced=bool(body.upgrade_lighting_advanced),
        rider_units=body.rider_units.dict() if body.rider_units else None,
        backline_requested=body.backline_requested,
    )
    return SoundEstimateOut(**payload)
