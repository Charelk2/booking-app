from datetime import datetime
from pydantic import BaseModel


class ServiceCategoryBase(BaseModel):
    name: str


class ServiceCategoryResponse(ServiceCategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
