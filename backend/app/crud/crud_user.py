from sqlalchemy.orm import Session
from typing import Optional

from .. import models, schemas
from ..utils.auth import get_password_hash # Assuming password hashing utility

class CRUDUser:
    def get_user(self, db: Session, user_id: int) -> Optional[models.User]:
        return db.query(models.User).filter(models.User.id == user_id).first()

    def get_user_by_email(self, db: Session, email: str) -> Optional[models.User]:
        return db.query(models.User).filter(models.User.email == email).first()

    def create_user(self, db: Session, user: schemas.UserCreate) -> models.User:
        hashed_password = get_password_hash(user.password)
        db_user = models.User(
            email=user.email,
            hashed_password=hashed_password,
            first_name=user.first_name,
            last_name=user.last_name,
            user_type=user.user_type
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    # Add other user-related CRUD operations if needed, e.g., update, delete

user = CRUDUser() # Create an instance for easy import 
