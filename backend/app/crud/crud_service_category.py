from sqlalchemy.orm import Session

from ..models.service_category import ServiceCategory


def get_categories(db: Session) -> list[ServiceCategory]:
    return db.query(ServiceCategory).all()


def get_category(db: Session, category_id: int) -> ServiceCategory | None:
    return db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
