from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .dependencies import get_db
from ..schemas.service_category import ServiceCategoryResponse
from ..crud import crud_service_category

router = APIRouter()


@router.get("/", response_model=list[ServiceCategoryResponse])
def list_service_categories(db: Session = Depends(get_db)):
    return crud_service_category.get_categories(db)
