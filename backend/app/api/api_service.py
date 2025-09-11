# app/api/api_service.py

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List

from ..database import get_db

# Import the actual ServiceProviderProfile model by name
from ..models.service_provider_profile import ServiceProviderProfile

from ..models.service import Service
from ..models.calendar_account import CalendarAccount, CalendarProvider
from ..models.service_category import ServiceCategory
from ..schemas.service import ServiceCreate, ServiceUpdate, ServiceResponse
from .dependencies import get_current_service_provider
from ..utils import error_response
from ..utils.redis_cache import invalidate_artist_list_cache
from ..utils.profile import is_artist_profile_complete

router = APIRouter(
    # Note: NO prefix here, because main.py already does `prefix="/api/v1/services"`
    tags=["Services"],
)


@router.get("/", response_model=List[ServiceResponse])
def list_services(db: Session = Depends(get_db)):
    """List approved services with artist info (public)."""
    services = (
        db.query(Service)
        .options(joinedload(Service.artist))
        .filter(getattr(Service, "status", "approved") == "approved")
        .order_by(Service.display_order)
        .all()
    )
    return services


@router.get("/{service_id}", response_model=ServiceResponse)
def read_service(service_id: int, db: Session = Depends(get_db)):
    """Read a single approved service by ID (public).

    Many client flows fetch supplier/musician services by id to read
    structured `details` (e.g., audience packages). Ensure this route
    exists so frontend calls to `/api/v1/services/{id}` do not 404.
    """
    svc = (
        db.query(Service)
        .options(joinedload(Service.artist))
        .filter(Service.id == service_id)
        .first()
    )
    if not svc or getattr(svc, "status", "approved") != "approved":
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    return svc


@router.post("/", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(
    *,
    db: Session = Depends(get_db),
    service_in: ServiceCreate,
    current_artist=Depends(get_current_service_provider)
):
    """
    Create a new service for the currently authenticated artist.
    Full path → POST /api/v1/services/
    """
    service_data = service_in.model_dump()

    # Gate service creation until the artist profile is complete
    artist_profile = (
        db.query(ServiceProviderProfile)
        .filter(ServiceProviderProfile.user_id == current_artist.id)
        .first()
    )
    if not artist_profile or not is_artist_profile_complete(artist_profile):
        raise error_response(
            "Please complete your profile before adding a service.",
            {"profile": "incomplete"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    # Require calendar sync as part of completion
    has_calendar = (
        db.query(CalendarAccount)
        .filter(
            CalendarAccount.user_id == current_artist.id,
            CalendarAccount.provider == CalendarProvider.GOOGLE,
        )
        .first()
        is not None
    )
    if not has_calendar:
        raise error_response(
            "Please sync your calendar before adding a service.",
            {"calendar": "required"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    # Resolve category by ID or slug if provided. This lets the frontend send a
    # stable slug (e.g., "dj") instead of relying on database IDs, which can
    # vary across deployments.
    category_id = service_data.pop("service_category_id", None)
    category_slug = service_data.pop("service_category_slug", None)

    if category_id is None and category_slug is None:
        raise error_response(
            "Service category is required.",
            {"service_category_slug": "required"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    if category_slug is not None:
        normalized = category_slug.replace("_", " ").lower()
        category = (
            db.query(ServiceCategory)
            .filter(func.lower(ServiceCategory.name) == normalized)
            .first()
        )
        if not category:
            raise error_response(
                "Invalid service category.",
                {"service_category_slug": "invalid"},
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        category_id = category.id

    if (
        category_id is not None
        and not db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
    ):
        raise error_response(
            "Invalid service category.",
            {"service_category_id": "invalid"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    if category_id is not None:
        service_data["service_category_id"] = category_id
    max_order = (
        db.query(func.max(Service.display_order))
        .filter(Service.artist_id == current_artist.id)
        .scalar()
    )
    if service_data.get("display_order") is None:
        service_data["display_order"] = (max_order or 0) + 1

    # Always create as pending_review until a moderator approves
    service_data["status"] = "pending_review"
    new_service = Service(**service_data, artist_id=current_artist.id)
    db.add(new_service)
    db.commit()
    db.refresh(new_service)
    invalidate_artist_list_cache()
    return new_service


@router.get("/mine", response_model=List[ServiceResponse])
def list_my_services(db: Session = Depends(get_db), current_artist=Depends(get_current_service_provider)):
    """List all services for the current artist, including unapproved ones (dashboard view)."""
    services = (
        db.query(Service)
        .options(joinedload(Service.artist))
        .filter(Service.artist_id == current_artist.id)
        .order_by(Service.display_order)
        .all()
    )
    return services


# Place read_service after static routes like /mine to avoid confusion with path matching.
@router.get("/{service_id}", response_model=ServiceResponse)
def read_service(service_id: int, db: Session = Depends(get_db)):
    """Read a single approved service by ID (public)."""
    svc = (
        db.query(Service)
        .options(joinedload(Service.artist))
        .filter(Service.id == service_id)
        .first()
    )
    if not svc or getattr(svc, "status", "approved") != "approved":
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    return svc


@router.put("/{service_id}", response_model=ServiceResponse)
def update_service(
    *,
    db: Session = Depends(get_db),
    service_id: int,
    service_in: ServiceUpdate,
    current_artist=Depends(get_current_service_provider)
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
        raise error_response(
            "Service not found or you don't have permission to update it.",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    update_data = service_in.model_dump(exclude_unset=True)
    category_id = update_data.pop("service_category_id", None)
    category_slug = update_data.pop("service_category_slug", None)

    if category_slug is not None:
        normalized = category_slug.replace("_", " ").lower()
        category = (
            db.query(ServiceCategory)
            .filter(func.lower(ServiceCategory.name) == normalized)
            .first()
        )
        if not category:
            raise error_response(
                "Invalid service category.",
                {"service_category_slug": "invalid"},
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        category_id = category.id

    if (
        category_id is not None
        and not db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
    ):
        raise error_response(
            "Invalid service category.",
            {"service_category_id": "invalid"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    if category_id is not None:
        update_data["service_category_id"] = category_id
    for field, value in update_data.items():
        setattr(service, field, value)

    db.add(service)
    db.commit()
    db.refresh(service)
    invalidate_artist_list_cache()
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
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    # Only expose approved services publicly
    if getattr(service, "status", "approved") != "approved":
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    return service


@router.get("/artist/{artist_user_id}", response_model=List[ServiceResponse])
def read_services_by_artist(artist_user_id: int, db: Session = Depends(get_db)):
    """
    Get all services offered by a specific artist (by their user_id).
    Full path → GET /api/v1/services/artist/{artist_user_id}
    """
    # Confirm that artist_user_id has a ServiceProviderProfile record
    artist_profile = (
        db.query(ServiceProviderProfile)
        .filter(ServiceProviderProfile.user_id == artist_user_id)
        .first()
    )
    if not artist_profile:
        raise error_response(
            "Artist profile not found for this user ID.",
            {"artist_user_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    services = (
        db.query(Service)
        .options(joinedload(Service.artist))
        .filter(Service.artist_id == artist_user_id)
        .filter(getattr(Service, "status", "approved") == "approved")
        .order_by(Service.display_order)
        .all()
    )
    return services


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    *,
    db: Session = Depends(get_db),
    service_id: int,
    current_artist=Depends(get_current_service_provider)
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
        raise error_response(
            "Service not found or you don't have permission to delete it.",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    db.delete(service)
    db.commit()
    invalidate_artist_list_cache()
    return None
