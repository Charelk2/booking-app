from sqlalchemy.orm import Session
from typing import Optional

from .. import models, schemas

class CRUDServiceProviderProfile:
    def get_profile_by_user_id(self, db: Session, user_id: int) -> Optional[models.ServiceProviderProfile]:
        return db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == user_id).first()

    def create_profile(
        self, db: Session, profile_in: schemas.ArtistProfileCreate, user_id: int
    ) -> models.ServiceProviderProfile:
        db_profile = models.ServiceProviderProfile(
            **profile_in.model_dump(),
            user_id=user_id
        )
        db.add(db_profile)
        db.commit()
        db.refresh(db_profile)
        return db_profile

    def update_profile(
        self,
        db: Session,
        db_profile: models.ServiceProviderProfile,
        profile_in: schemas.ArtistProfileUpdate
    ) -> models.ServiceProviderProfile:
        update_data = profile_in.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_profile, key, value)
        db.commit()
        db.refresh(db_profile)
        return db_profile

service_provider_profile = CRUDServiceProviderProfile()
