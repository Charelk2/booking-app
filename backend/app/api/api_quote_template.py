from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging

from ..database import get_db
from .. import schemas, crud, models

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/quote-templates", response_model=schemas.QuoteTemplateRead)
def create_quote_template(template_in: schemas.QuoteTemplateCreate, db: Session = Depends(get_db)):
    try:
        return crud.crud_quote_template.create_template(db, template_in)
    except Exception as exc:  # pragma: no cover - log unexpected errors
        logger.error("Error creating quote template for artist %s: %s", template_in.artist_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Unable to create template", "field_errors": {"template": "create_failed"}},
        )


@router.get("/quote-templates/artist/{artist_id}", response_model=list[schemas.QuoteTemplateRead])
def list_templates(artist_id: int, db: Session = Depends(get_db)):
    return crud.crud_quote_template.get_templates_for_artist(db, artist_id)


@router.get("/quote-templates/{template_id}", response_model=schemas.QuoteTemplateRead)
def read_template(template_id: int, db: Session = Depends(get_db)):
    template = crud.crud_quote_template.get_template(db, template_id)
    if not template:
        logger.info("Quote template %s not found", template_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": f"Template {template_id} not found", "field_errors": {"template_id": "not_found"}},
        )
    return template


@router.put("/quote-templates/{template_id}", response_model=schemas.QuoteTemplateRead)
def update_template(template_id: int, template_in: schemas.QuoteTemplateUpdate, db: Session = Depends(get_db)):
    template = crud.crud_quote_template.get_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail={"message": f"Template {template_id} not found", "field_errors": {"template_id": "not_found"}})
    return crud.crud_quote_template.update_template(db, template, template_in)


@router.delete("/quote-templates/{template_id}", response_model=schemas.QuoteTemplateRead)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    template = crud.crud_quote_template.delete_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail={"message": f"Template {template_id} not found", "field_errors": {"template_id": "not_found"}})
    return template
