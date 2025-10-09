from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
import logging

from ..database import get_db
from .. import schemas, crud, models
from ..utils import error_response

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/quote-templates", response_model=schemas.QuoteTemplateRead)
def create_quote_template(
    template_in: schemas.QuoteTemplateCreate, db: Session = Depends(get_db)
):
    try:
        tpl = crud.crud_quote_template.create_template(db, template_in)
        # Coalesce timestamps (belt-and-braces for legacy DBs)
        try:
            from datetime import datetime as _dt
            if not getattr(tpl, "created_at", None):
                tpl.created_at = getattr(tpl, "updated_at", None) or _dt.utcnow()
            if not getattr(tpl, "updated_at", None):
                tpl.updated_at = tpl.created_at
            db.add(tpl)
            db.commit()
            db.refresh(tpl)
        except Exception:
            pass
        return tpl
    except Exception as exc:  # pragma: no cover - log unexpected errors
        logger.error(
            "Error creating quote template for artist %s: %s",
            template_in.artist_id,
            exc,
            exc_info=True,
        )
        raise error_response(
            "Unable to create template",
            {"template": "create_failed"},
            status.HTTP_400_BAD_REQUEST,
        )


@router.get(
    "/quote-templates/artist/{artist_id}",
    response_model=list[schemas.QuoteTemplateRead],
)
def list_templates(artist_id: int, db: Session = Depends(get_db)):
    tpls = crud.crud_quote_template.get_templates_for_artist(db, artist_id)
    try:
        from datetime import datetime as _dt
        for tpl in tpls:
            if not getattr(tpl, "created_at", None):
                tpl.created_at = getattr(tpl, "updated_at", None) or _dt.utcnow()
            if not getattr(tpl, "updated_at", None):
                tpl.updated_at = tpl.created_at
        db.commit()
    except Exception:
        pass
    return tpls


@router.get("/quote-templates/{template_id}", response_model=schemas.QuoteTemplateRead)
def read_template(template_id: int, db: Session = Depends(get_db)):
    template = crud.crud_quote_template.get_template(db, template_id)
    if not template:
        logger.info("Quote template %s not found", template_id)
        raise error_response(
            f"Template {template_id} not found",
            {"template_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    # Defensive: coalesce timestamps
    try:
        from datetime import datetime as _dt
        if not getattr(template, "created_at", None):
            template.created_at = getattr(template, "updated_at", None) or _dt.utcnow()
        if not getattr(template, "updated_at", None):
            template.updated_at = template.created_at
        db.add(template)
        db.commit()
        db.refresh(template)
    except Exception:
        pass
    return template


@router.put("/quote-templates/{template_id}", response_model=schemas.QuoteTemplateRead)
def update_template(
    template_id: int,
    template_in: schemas.QuoteTemplateUpdate,
    db: Session = Depends(get_db),
):
    template = crud.crud_quote_template.get_template(db, template_id)
    if not template:
        raise error_response(
            f"Template {template_id} not found",
            {"template_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    updated = crud.crud_quote_template.update_template(db, template, template_in)
    try:
        from datetime import datetime as _dt
        if not getattr(updated, "created_at", None):
            updated.created_at = getattr(updated, "updated_at", None) or _dt.utcnow()
        if not getattr(updated, "updated_at", None):
            updated.updated_at = updated.created_at
        db.add(updated)
        db.commit()
        db.refresh(updated)
    except Exception:
        pass
    return updated


@router.delete(
    "/quote-templates/{template_id}", response_model=schemas.QuoteTemplateRead
)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    template = crud.crud_quote_template.delete_template(db, template_id)
    if not template:
        raise error_response(
            f"Template {template_id} not found",
            {"template_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    try:
        from datetime import datetime as _dt
        if not getattr(template, "created_at", None):
            template.created_at = getattr(template, "updated_at", None) or _dt.utcnow()
        if not getattr(template, "updated_at", None):
            template.updated_at = template.created_at
    except Exception:
        pass
    return template
