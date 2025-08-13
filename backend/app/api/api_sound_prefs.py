from typing import List, Optional
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..utils import error_response
from .dependencies import get_current_service_provider

router = APIRouter(tags=["sound-preferences"])


class CityPreference(BaseModel):
    city: str
    provider_ids: List[int]
    request_timeout_hours: Optional[int] = 24


class SoundPrefsIn(BaseModel):
    city_preferences: List[CityPreference]


class SoundPrefsOut(BaseModel):
    city_preferences: List[CityPreference]


@router.get("/services/{service_id}/sound-preferences", response_model=SoundPrefsOut)
def get_sound_preferences(service_id: int, db: Session = Depends(get_db)):
    svc = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not svc:
        raise error_response("Service not found", {"service_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    details = svc.details or {}
    sp = details.get("sound_provisioning") or {}
    prefs = sp.get("city_preferences") or []
    return SoundPrefsOut(city_preferences=[CityPreference(**p) for p in prefs])


@router.post("/services/{service_id}/sound-preferences", response_model=SoundPrefsOut, status_code=status.HTTP_201_CREATED)
def set_sound_preferences(
    service_id: int,
    body: SoundPrefsIn,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_service_provider),
):
    svc = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not svc:
        raise error_response("Service not found", {"service_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if svc.artist_id != current_artist.id:
        raise error_response("Forbidden", {"service_id": "forbidden"}, status.HTTP_403_FORBIDDEN)
    details = svc.details or {}
    details.setdefault("sound_provisioning", {})
    details["sound_provisioning"]["city_preferences"] = [p.model_dump() for p in body.city_preferences]
    svc.details = details
    db.add(svc)
    db.commit()
    db.refresh(svc)
    return SoundPrefsOut(city_preferences=body.city_preferences)

