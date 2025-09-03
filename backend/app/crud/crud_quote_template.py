from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal

from .. import models, schemas


def create_template(db: Session, template_in: schemas.QuoteTemplateCreate) -> models.QuoteTemplate:
    subtotal = sum(item.price for item in template_in.services)
    services = [{"description": s.description, "price": float(s.price)} for s in template_in.services]
    db_template = models.QuoteTemplate(
        artist_id=template_in.artist_id,
        name=template_in.name,
        services=services,
        sound_fee=template_in.sound_fee,
        travel_fee=template_in.travel_fee,
        accommodation=template_in.accommodation,
        discount=template_in.discount,
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template


def get_templates_for_artist(db: Session, artist_id: int) -> List[models.QuoteTemplate]:
    return db.query(models.QuoteTemplate).filter(models.QuoteTemplate.artist_id == artist_id).all()


def get_template(db: Session, template_id: int) -> Optional[models.QuoteTemplate]:
    return db.query(models.QuoteTemplate).filter(models.QuoteTemplate.id == template_id).first()


def update_template(db: Session, db_template: models.QuoteTemplate, template_in: schemas.QuoteTemplateUpdate) -> models.QuoteTemplate:
    update_data = template_in.model_dump(exclude_unset=True)
    if "services" in update_data:
        update_data["services"] = [
            {"description": s.description, "price": float(s.price)} for s in update_data["services"]
        ]
    for key, value in update_data.items():
        setattr(db_template, key, value)
    db.commit()
    db.refresh(db_template)
    return db_template


def delete_template(db: Session, template_id: int) -> Optional[models.QuoteTemplate]:
    db_template = db.query(models.QuoteTemplate).filter(models.QuoteTemplate.id == template_id).first()
    if db_template:
        db.delete(db_template)
        db.commit()
    return db_template
