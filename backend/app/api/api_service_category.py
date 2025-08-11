from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from .dependencies import get_db
from ..schemas.service_category import ServiceCategoryResponse
from ..crud import crud_service_category

router = APIRouter()


@router.get("/", response_model=list[ServiceCategoryResponse])
def list_service_categories(response: Response, db: Session = Depends(get_db)):
    categories = crud_service_category.get_categories(db)
    # Cache static service category list for one hour
    response.headers["Cache-Control"] = "public, max-age=3600"
    return categories
