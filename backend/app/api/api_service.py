# app/api/api_service.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List

from ..database import get_db

# Import the actual ArtistProfileV2 model by name
from ..models.artist_profile_v2 import ArtistProfileV2 as ArtistProfile

from ..models.service import Service
from ..schemas.service import ServiceCreate, ServiceUpdate, ServiceResponse
from .dependencies import get_current_active_artist

router = APIRouter(
    # Note: NO prefix here, because main.py already does `prefix="/api/v1/services"`
    tags=["Services"],
)


@router.get("/", response_model=List[ServiceResponse])
def list_services(db: Session = Depends(get_db)):
    """List all services with artist info."""
    services = (
        db.query(Service)
        .options(joinedload(Service.artist))
        .order_by(Service.display_order)
        .all()
    )
    return services


@router.post("/", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(
    *,
    db: Session = Depends(get_db),
    service_in: ServiceCreate,
    current_artist=Depends(get_current_active_artist)
):
    """
    Create a new service for the currently authenticated artist.
    Full path → POST /api/v1/services/
    """
    service_data = service_in.model_dump()
    max_order = (
        db.query(func.max(Service.display_order))
        .filter(Service.artist_id == current_artist.id)
        .scalar()
    )
    if service_data.get("display_order") is None:
        service_data["display_order"] = (max_order or 0) + 1

    new_service = Service(**service_data, artist_id=current_artist.id)
    db.add(new_service)
    db.commit()
    db.refresh(new_service)
    return new_service


@router.put("/{service_id}", response_model=ServiceResponse)
def update_service(
    *,
    db: Session = Depends(get_db),
    service_id: int,
    service_in: ServiceUpdate,
    current_artist=Depends(get_current_active_artist)
):
    """
    Update a service owned by the currently authenticated artist.
    Full path → PUT /api/v1/services/{service_id}
    """
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.artist_id == current_artist.id)
        .first()
    )
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found or you don't have permission to update it.",
        )

    update_data = service_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(service, field, value)

    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.get("/{service_id}", response_model=ServiceResponse)
def read_service(service_id: int, db: Session = Depends(get_db)):
    """
    Get a specific service by its ID (publicly accessible).
    Full path → GET /api/v1/services/{service_id}
    """
    service = (
        db.query(Service)
        .options(joinedload(Service.artist))
        .filter(Service.id == service_id)
        .first()
    )
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Service not found"
        )
    return service


@router.get("/artist/{artist_user_id}", response_model=List[ServiceResponse])
def read_services_by_artist(artist_user_id: int, db: Session = Depends(get_db)):
    """
    Get all services offered by a specific artist (by their user_id).
    Full path → GET /api/v1/services/artist/{artist_user_id}
    """
    # Confirm that artist_user_id has an ArtistProfile record
    artist_profile = (
        db.query(ArtistProfile).filter(ArtistProfile.user_id == artist_user_id).first()
    )
    if not artist_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artist profile not found for this user ID.",
        )

    services = (
        db.query(Service)
        .options(joinedload(Service.artist))
        .filter(Service.artist_id == artist_user_id)
        .order_by(Service.display_order)
        .all()
    )
    return services


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    *,
    db: Session = Depends(get_db),
    service_id: int,
    current_artist=Depends(get_current_active_artist)
):
    """
    Delete a service owned by the currently authenticated artist.
    Full path → DELETE /api/v1/services/{service_id}
    """
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.artist_id == current_artist.id)
        .first()
    )
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found or you don't have permission to delete it.",
        )

    db.delete(service)
    db.commit()
    return None
