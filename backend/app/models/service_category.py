from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from .base import BaseModel


class ServiceCategory(BaseModel):
    __tablename__ = "service_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    providers = relationship(
        "ArtistProfileV2",
        back_populates="service_category",
    )
