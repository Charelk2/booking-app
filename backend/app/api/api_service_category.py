"""API endpoints for service categories."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.service_category import (
    ServiceCategoryResponse,
    ServiceCategoryCreate,
    ServiceCategoryUpdate,
)
from app.crud import (
    get_service_categories,
    get_service_category,
    create_service_category,
    update_service_category,
    remove_service_category,
)
from .auth import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=list[ServiceCategoryResponse])
def read_service_categories(db: Session = Depends(get_db)):
    """Return all available service categories."""
    return get_service_categories(db)


@router.post("/", response_model=ServiceCategoryResponse)
def create_category(
    category_in: ServiceCategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Create a new service category."""
    return create_service_category(db, category_in)


@router.put("/{category_id}", response_model=ServiceCategoryResponse)
def update_category(
    category_id: int,
    category_in: ServiceCategoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Update an existing service category."""
    category = get_service_category(db, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return update_service_category(db, category, category_in)


@router.delete("/{category_id}", response_model=ServiceCategoryResponse)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Delete a service category."""
    category = remove_service_category(db, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category
