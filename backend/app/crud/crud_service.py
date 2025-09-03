from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas
from ..models.service_category import ServiceCategory

class CRUDService:
    def get_service(self, db: Session, service_id: int) -> Optional[models.Service]:
        return db.query(models.Service).filter(models.Service.id == service_id).first()

    def get_services_by_artist(
        self, db: Session, artist_id: int, skip: int = 0, limit: int = 100
    ) -> List[models.Service]:
        return (
            db.query(models.Service)
            .filter(models.Service.artist_id == artist_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create_artist_service(
        self, db: Session, service: schemas.ServiceCreate, artist_id: int
    ) -> models.Service:
        # Ensure provided service_category_id exists
        category_id = service.service_category_id
        if (
            category_id is not None
            and not db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
        ):
            raise ValueError("Invalid service category")
        db_service = models.Service(**service.model_dump(), artist_id=artist_id)
        db.add(db_service)
        db.commit()
        db.refresh(db_service)
        return db_service

    def update_service(
        self, 
        db: Session, 
        db_service: models.Service, 
        service_in: schemas.ServiceUpdate
    ) -> models.Service:
        update_data = service_in.model_dump(exclude_unset=True)
        category_id = update_data.get("service_category_id")
        if (
            category_id is not None
            and not db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
        ):
            raise ValueError("Invalid service category")
        for key, value in update_data.items():
            setattr(db_service, key, value)
        db.commit()
        db.refresh(db_service)
        return db_service

    def delete_service(self, db: Session, service_id: int) -> Optional[models.Service]:
        db_service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if db_service:
            db.delete(db_service)
            db.commit()
        return db_service

service = CRUDService() 
