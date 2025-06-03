from sqlalchemy.orm import Session
from typing import Optional

from .. import models, schemas

class CRUDArtistProfile:
    def get_artist_profile_by_user_id(self, db: Session, user_id: int) -> Optional[models.ArtistProfile]:
        return db.query(models.ArtistProfile).filter(models.ArtistProfile.user_id == user_id).first()

    def create_artist_profile(
        self, db: Session, profile_in: schemas.ArtistProfileCreate, user_id: int
    ) -> models.ArtistProfile:
        db_profile = models.ArtistProfile(
            **profile_in.model_dump(), 
            user_id=user_id
        )
        db.add(db_profile)
        db.commit()
        db.refresh(db_profile)
        return db_profile

    def update_artist_profile(
        self, 
        db: Session, 
        db_profile: models.ArtistProfile, 
        profile_in: schemas.ArtistProfileUpdate
    ) -> models.ArtistProfile:
        update_data = profile_in.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_profile, key, value)
        db.commit()
        db.refresh(db_profile)
        return db_profile

artist_profile = CRUDArtistProfile() 