"""Pydantic schemas for service categories."""
from typing import Optional
from pydantic import BaseModel


class ServiceCategoryBase(BaseModel):
    name: str


class ServiceCategoryCreate(ServiceCategoryBase):
    pass


class ServiceCategoryUpdate(BaseModel):
    name: Optional[str] = None


class ServiceCategoryResponse(ServiceCategoryBase):
    id: int

    model_config = {"from_attributes": True}
