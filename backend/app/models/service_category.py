from sqlalchemy import Column, Integer, String
from .base import BaseModel


class ServiceCategory(BaseModel):
    __tablename__ = "service_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
