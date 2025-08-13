from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..utils import error_response

router = APIRouter(tags=["rider"])


@router.get("/services/{service_id}/rider", response_model=schemas.RiderRead)
def get_rider(service_id: int, db: Session = Depends(get_db)):
    r = (
        db.query(models.Rider)
        .filter(models.Rider.service_id == service_id)
        .first()
    )
    if not r:
        raise error_response("Rider not found", {"service_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    return r


@router.post("/services/{service_id}/rider", response_model=schemas.RiderRead, status_code=status.HTTP_201_CREATED)
def upsert_rider(service_id: int, rider_in: schemas.RiderCreate, db: Session = Depends(get_db)):
    r = (
        db.query(models.Rider)
        .filter(models.Rider.service_id == service_id)
        .first()
    )
    if r:
        if rider_in.spec is not None:
            r.spec = rider_in.spec
        if rider_in.pdf_url is not None:
            r.pdf_url = rider_in.pdf_url
        db.add(r)
        db.commit()
        db.refresh(r)
        return r
    r = models.Rider(service_id=service_id, spec=rider_in.spec, pdf_url=rider_in.pdf_url)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ─── Templates ───────────────────────────────────────────────────────────────

TEMPLATES = {
    "solo": {
        "audience_tier": "0-150",
        "foh_tier": "S",
        "monitors": 1,
        "mics": {"dynamic": 1, "condenser": 0},
        "di": 1,
        "wireless": 0,
        "backline": [],
        "lighting": {"tier": "A"},
        "crew": {"foh": 0, "stage": 0},
        "setup_minutes": 30,
        "teardown_minutes": 20,
        "power": "1x 20A",
        "notes": "Solo + backing tracks",
    },
    "duo": {
        "audience_tier": "0-150",
        "foh_tier": "S",
        "monitors": 2,
        "mics": {"dynamic": 2, "condenser": 0},
        "di": 2,
        "wireless": 0,
        "backline": [],
        "lighting": {"tier": "A"},
        "crew": {"foh": 0, "stage": 0},
        "setup_minutes": 40,
        "teardown_minutes": 25,
        "power": "1x 20A",
        "notes": "Duo vocals + guitar",
    },
    "band_4p": {
        "audience_tier": "150-500",
        "foh_tier": "M",
        "monitors": 4,
        "mics": {"dynamic": 6, "condenser": 2},
        "di": 3,
        "wireless": 0,
        "backline": ["drum_kit_tier_B", "bass_amp", "guitar_amp"],
        "lighting": {"tier": "B"},
        "crew": {"foh": 1, "stage": 1},
        "setup_minutes": 60,
        "teardown_minutes": 45,
        "power": "2x 20A",
        "notes": "4-piece band",
    },
    "dj": {
        "audience_tier": "0-300",
        "foh_tier": "S",
        "monitors": 1,
        "mics": {"dynamic": 1, "condenser": 0},
        "di": 0,
        "wireless": 1,
        "backline": ["dj_controller"],
        "lighting": {"tier": "A"},
        "crew": {"foh": 0, "stage": 0},
        "setup_minutes": 30,
        "teardown_minutes": 20,
        "power": "1x 20A",
        "notes": "DJ + MC",
    },
}


@router.get("/rider/templates")
def list_rider_templates():
    return {"templates": [{"name": k, "spec": v} for k, v in TEMPLATES.items()]}


class ApplyTemplateIn(BaseModel):
    template: str


@router.post("/services/{service_id}/rider/apply-template", response_model=schemas.RiderRead)
def apply_rider_template(service_id: int, body: ApplyTemplateIn, db: Session = Depends(get_db)):
    name = (body.template or "").lower()
    if name not in TEMPLATES:
        raise error_response("Unknown template", {"template": "invalid"}, status.HTTP_422_UNPROCESSABLE_ENTITY)
    spec = TEMPLATES[name]
    r = (
        db.query(models.Rider)
        .filter(models.Rider.service_id == service_id)
        .first()
    )
    if r:
        r.spec = spec
        db.add(r)
        db.commit()
        db.refresh(r)
        return r
    r = models.Rider(service_id=service_id, spec=spec)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r
