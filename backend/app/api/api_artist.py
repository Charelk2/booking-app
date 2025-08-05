# backend/app/api/v1/api_artist.py

from fastapi import APIRouter, Depends, status, UploadFile, File, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Any
import shutil
import uuid
import os
import logging

from ..database import get_db
from ..models.user import User, UserType

# Import the V2 class directly so we don't accidentally pick up a stale __init__.py
from ..models.artist_profile_v2 import ArtistProfileV2 as ArtistProfile
from ..schemas.artist import (
    ArtistProfileCreate,
    ArtistProfileUpdate,
    ArtistProfileResponse,
)
from .dependencies import get_current_user, get_current_active_artist
from ..utils import error_response
from ..services.recommendation_service import RecommendationService

router = APIRouter()  # No prefix here. Main mounts it under "/api/v1/artist-profiles".
logger = logging.getLogger(__name__)

#
# We will save uploaded pictures under backend/static/...
#
PROFILE_PICS_SAVE_SUBDIR = "profile_pics"
COVER_PHOTOS_SAVE_SUBDIR = "cover_photos"

# Compute absolute paths to <project_root>/backend/static/profile_pics and /cover_photos
BASE_STATIC_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "static")
)
PROFILE_PICS_SAVE_PATH = os.path.join(BASE_STATIC_PATH, PROFILE_PICS_SAVE_SUBDIR)
COVER_PHOTOS_SAVE_PATH = os.path.join(BASE_STATIC_PATH, COVER_PHOTOS_SAVE_SUBDIR)

# Ensure the directories actually exist
os.makedirs(PROFILE_PICS_SAVE_PATH, exist_ok=True)
os.makedirs(COVER_PHOTOS_SAVE_PATH, exist_ok=True)


@router.post(
    "/me",
    response_model=ArtistProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Artist Profile for Current User",
)
def create_artist_profile_for_current_user(
    *,
    db: Session = Depends(get_db),
    profile_in: ArtistProfileCreate,
    current_artist: User = Depends(get_current_active_artist),
) -> Any:
    """
    Create an artist profile for the currently authenticated artist user.
    """
    existing_profile = (
        db.query(ArtistProfile)
        .filter(ArtistProfile.user_id == current_artist.id)
        .first()
    )
    if existing_profile:
        raise error_response(
            "Artist profile already exists for this user.",
            {},
            status.HTTP_400_BAD_REQUEST,
        )

    profile_data = profile_in.model_dump()
    db_profile = ArtistProfile(**profile_data, user_id=current_artist.id)

    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile


@router.get(
    "/me",
    response_model=ArtistProfileResponse,
    summary="Read Current Artist Profile",
)
def read_artist_profile_me(
    *,
    db: Session = Depends(get_db),
    current_artist: User = Depends(get_current_active_artist),
) -> Any:
    """
    Get the artist profile of the currently authenticated artist user.
    """
    profile = (
        db.query(ArtistProfile)
        .filter(ArtistProfile.user_id == current_artist.id)
        .first()
    )
    if not profile:
        raise error_response(
            "Artist profile not found for current user. Please create one.",
            {},
            status.HTTP_404_NOT_FOUND,
        )
    return profile


@router.put(
    "/me",
    response_model=ArtistProfileResponse,
    summary="Update Current Artist Profile",
)
def update_artist_profile_me(
    *,
    db: Session = Depends(get_db),
    profile_in: ArtistProfileUpdate,
    current_artist: User = Depends(get_current_active_artist),
) -> Any:
    """
    Update the artist profile of the currently authenticated artist user.
    """
    profile = (
        db.query(ArtistProfile)
        .filter(ArtistProfile.user_id == current_artist.id)
        .first()
    )
    if not profile:
        raise error_response(
            "Artist profile not found. Cannot update.",
            {},
            status.HTTP_404_NOT_FOUND,
        )

    update_data = profile_in.model_dump(exclude_unset=True)

    # If portfolio_urls is a list of Pydantic Url types, convert to strings
    if "portfolio_urls" in update_data and update_data["portfolio_urls"] is not None:
        update_data["portfolio_urls"] = [
            str(url) for url in update_data["portfolio_urls"]
        ]

    # If profile_picture_url is provided as URL type, convert to string
    if (
        "profile_picture_url" in update_data
        and update_data["profile_picture_url"] is not None
    ):
        update_data["profile_picture_url"] = str(update_data["profile_picture_url"])

    for field, value in update_data.items():
        setattr(profile, field, value)

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get(
    "/",
    response_model=List[ArtistProfileResponse],
    summary="List All Artist Profiles",
)
def list_all_artist_profiles(db: Session = Depends(get_db)) -> Any:
    """
    Get all active artist profiles (publicly accessible), with nested user data.
    """
    profiles = (
        db.query(ArtistProfile)
        .join(User, ArtistProfile.user_id == User.id)
        .filter(User.is_active == True, User.user_type == UserType.ARTIST)
        .options(joinedload(ArtistProfile.user))
        .all()
    )
    return profiles


@router.get(
    "/{user_id}",
    response_model=ArtistProfileResponse,
    summary="Read Artist Profile by User ID",
)
def read_artist_profile_by_user_id(user_id: int, db: Session = Depends(get_db)) -> Any:
    """
    Get an artist profile by their user ID (publicly accessible).
    """
    profile = (
        db.query(ArtistProfile)
        .options(joinedload(ArtistProfile.user))
        .filter(ArtistProfile.user_id == user_id)
        .first()
    )

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artist profile not found."
        )

    if not (
        profile.user
        and profile.user.is_active
        and profile.user.user_type == UserType.ARTIST
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artist not found or not active.",
        )

    return profile


@router.post(
    "/me/profile-picture",
    response_model=ArtistProfileResponse,
    summary="Upload/Update Profile Picture",
)
async def upload_artist_profile_picture_me(
    *,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    current_artist: User = Depends(get_current_active_artist),
) -> Any:
    """
    Upload or update the profile picture for the currently authenticated artist.
    """
    profile = (
        db.query(ArtistProfile)
        .filter(ArtistProfile.user_id == current_artist.id)
        .first()
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artist profile not found. Cannot update picture.",
        )

    # Generate a unique filename with the same extension
    _, ext = os.path.splitext(file.filename)
    unique_filename = f"{uuid.uuid4()}{ext}"

    save_path = os.path.join(PROFILE_PICS_SAVE_PATH, unique_filename)
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save image file: {str(e)}",
        )
    finally:
        file.file.close()

    # The URL that the frontend will use
    db_url = f"/static/{PROFILE_PICS_SAVE_SUBDIR}/{unique_filename}"
    profile.profile_picture_url = db_url

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.post(
    "/me/cover-photo",
    response_model=ArtistProfileResponse,
    summary="Upload/Update Cover Photo",
)
async def upload_artist_cover_photo_me(
    *,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    current_artist: User = Depends(get_current_active_artist),
) -> Any:
    """
    Upload or update the cover photo for the currently authenticated artist.
    """
    profile = (
        db.query(ArtistProfile)
        .filter(ArtistProfile.user_id == current_artist.id)
        .first()
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artist profile not found. Cannot update cover photo.",
        )

    # Keep original extension if present, else default to ".jpg"
    _, ext = os.path.splitext(file.filename)
    if not ext:
        ext = ".jpg"
    unique_filename = f"{uuid.uuid4()}{ext}"

    save_path = os.path.join(COVER_PHOTOS_SAVE_PATH, unique_filename)
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save image file: {str(e)}",
        )
    finally:
        file.file.close()

    db_url = f"/static/{COVER_PHOTOS_SAVE_SUBDIR}/{unique_filename}"
    profile.cover_photo_url = db_url

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile

recommendation_router = APIRouter()

@recommendation_router.get(
    "/recommended",
    response_model=List[ArtistProfileResponse],
    summary="Get recommended artists",
)
def recommended_artists(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(5, ge=1, le=20),
) -> Any:
    """Return personalized artist suggestions for the current user."""
    service = RecommendationService()
    try:
        return service.recommend_for_user(db, current_user.id, limit=limit)
    except Exception as exc:  # pragma: no cover - log unexpected errors
        logger.exception("Failed to generate recommendations for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate recommendations.",
        ) from exc
