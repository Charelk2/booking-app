"""CRUD operations for service categories."""
from sqlalchemy.orm import Session
from app.models.service_category import ServiceCategory
from app.schemas.service_category import (
    ServiceCategoryCreate,
    ServiceCategoryUpdate,
)


def get(db: Session, category_id: int) -> ServiceCategory | None:
    return (
        db.query(ServiceCategory)
        .filter(ServiceCategory.id == category_id)
        .first()
    )


def get_multi(db: Session) -> list[ServiceCategory]:
    return db.query(ServiceCategory).all()


def create(db: Session, category_in: ServiceCategoryCreate) -> ServiceCategory:
    category = ServiceCategory(**category_in.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update(
    db: Session, db_obj: ServiceCategory, category_in: ServiceCategoryUpdate
) -> ServiceCategory:
    for field, value in category_in.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def remove(db: Session, category_id: int) -> ServiceCategory | None:
    obj = db.query(ServiceCategory).get(category_id)
    if not obj:
        return None
    db.delete(obj)
    db.commit()
    return obj
