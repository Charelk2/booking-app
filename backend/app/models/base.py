from datetime import datetime
from sqlalchemy import Column, DateTime
from ..database import Base  # This is the same Base created by declarative_base()

class BaseModel(Base):
    __abstract__ = True

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
