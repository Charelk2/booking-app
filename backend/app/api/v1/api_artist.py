# app/api/v1/api_artist.py

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from collections import defaultdict
from datetime import datetime, timedelta
import logging
import re
import shutil
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any
from pydantic import BaseModel

from app.utils.redis_cache import get_cached_artist_list, cache_artist_list
from app.services import calendar_service

from app.database import get_db
from app.models.user import User
from app.models.artist_profile_v2 import ArtistProfileV2 as Artist
from app.models.booking import Booking, BookingStatus
from app.models.request_quote import BookingRequest, BookingRequestStatus
from app.models.service import Service, ServiceType
from app.models.review import Review
from app.schemas.artist import (
    ArtistProfileResponse,
    ArtistProfileUpdate,  # new Pydantic schema for updates
    ArtistAvailabilityResponse,
    ArtistListResponse,
)
from app.api.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Price distribution buckets used for the histogram on the frontend.
# Extend or modify these ranges as needed. Ensure the max aligns with
# SLIDER_MAX from the frontend filter constants.
PRICE_BUCKETS: List[Tuple[int, int]] = [
    (0, 1000),
    (1001, 2000),
    (2001, 3000),
    (3001, 4000),
    (4001, 5000),
    (5001, 7500),
    (7501, 10000),
    (10001, 15000),
    (15001, 20000),
    (20001, 30000),
    (30001, 40000),
    (40001, 50000),
    (50001, 75000),
    (75001, 100000),
    (100001, 150000),
    (150001, 200000),
    (200001, 300000),
    (300001, 400000),
    (400001, 500000),
    (500001, 1000000),
    (1000001, 2000000),
    (2000001, 5000000),
]

# Paths for storing uploaded images:
STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"
PROFILE_PICS_DIR = STATIC_DIR / "profile_pics"
COVER_PHOTOS_DIR = STATIC_DIR / "cover_photos"
PORTFOLIO_IMAGES_DIR = STATIC_DIR / "portfolio_images"
# Create directories if they don’t exist
PROFILE_PICS_DIR.mkdir(parents=True, exist_ok=True)
COVER_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
PORTFOLIO_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

MAX_PROFILE_PIC_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_PROFILE_PIC_TYPES = ["image/jpeg", "image/png", "image/webp"]
ALLOWED_PORTFOLIO_IMAGE_TYPES = ALLOWED_PROFILE_PIC_TYPES
MAX_PORTFOLIO_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/me", response_model=ArtistProfileResponse)
def read_current_artist_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    GET /api/v1/artist-profiles/me
    Returns the profile of the currently authenticated artist.
    """
    artist_profile = (
        db.query(Artist)
          .filter(Artist.user_id == current_user.id)
          .first()
    )
    if not artist_profile:
        raise HTTPException(
            status_code=404,
            detail="Artist profile not found.",
        )
    return artist_profile


@router.put(
    "/me",
    response_model=ArtistProfileResponse,
    summary="Update current artist's profile",
    description=(
        "Update fields of the currently authenticated artist's profile."
    )
)
def update_current_artist_profile(
    profile_in: ArtistProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    PUT /api/v1/artist-profiles/me
    Allows the authenticated artist to update their own profile fields.
    """
    artist_profile = (
        db.query(Artist)
          .filter(Artist.user_id == current_user.id)
          .first()
    )
    if not artist_profile:
        raise HTTPException(
            status_code=404,
            detail="Artist profile not found.",
        )

    update_data = profile_in.model_dump(exclude_unset=True)

    # Convert Pydantic HttpUrl objects to plain strings for JSON columns
    if (
        "portfolio_urls" in update_data
        and update_data["portfolio_urls"] is not None
    ):
        update_data["portfolio_urls"] = [
            str(url) for url in update_data["portfolio_urls"]
        ]

    if (
        "profile_picture_url" in update_data
        and update_data["profile_picture_url"] is not None
    ):
        update_data["profile_picture_url"] = str(
            update_data["profile_picture_url"]
        )

    for field, value in update_data.items():
        setattr(artist_profile, field, value)

    db.add(artist_profile)
    db.commit()
    db.refresh(artist_profile)
    return artist_profile


@router.post(
    "/me/profile-picture",
    response_model=ArtistProfileResponse,
    summary="Upload or update current artist's profile picture",
    description=(
        "Uploads a new profile picture for the currently authenticated artist,"
        " replacing any existing one."
    )
)
async def upload_artist_profile_picture_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...)
):
    """
    POST /api/v1/artist-profiles/me/profile-picture
    """
    artist_profile = (
        db.query(Artist)
          .filter(Artist.user_id == current_user.id)
          .first()
    )
    if not artist_profile:
        raise HTTPException(
            status_code=404,
            detail="Artist profile not found.",
        )

    if file.content_type not in ALLOWED_PROFILE_PIC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid image type. Allowed: {ALLOWED_PROFILE_PIC_TYPES}"
            )
        )

    try:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original = Path(file.filename or "profile").name
        sanitized = re.sub(r"[^a-zA-Z0-9_.-]", "_", original)
        unique_filename = f"{timestamp}_{current_user.id}_{sanitized}"

        file_path = PROFILE_PICS_DIR / unique_filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Delete old profile picture if it exists
        if artist_profile.profile_picture_url:
            old_rel = artist_profile.profile_picture_url.replace(
                "/static/",
                "",
                1,
            )
            old_file = STATIC_DIR / old_rel
            if old_file.exists() and old_file != file_path:
                try:
                    old_file.unlink()
                except OSError as e:
                    logger.warning("Error deleting old profile picture %s: %s", old_file, e)

        artist_profile.profile_picture_url = (
            f"/static/profile_pics/{unique_filename}"
        )
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)

        return artist_profile

    except Exception as e:
        if 'file_path' in locals() and file_path.exists():
            try:
                file_path.unlink()
            except OSError as cleanup_err:
                logger.warning("Error cleaning up profile picture %s: %s", file_path, cleanup_err)
        raise HTTPException(status_code=500, detail=f"Could not upload profile picture: {e}")

    finally:
        await file.close()


@router.post(
    "/me/cover-photo",
    response_model=ArtistProfileResponse,
    summary="Upload or update current artist's cover photo",
    description="Uploads a new cover photo for the currently authenticated artist, replacing any existing one."
)
async def upload_artist_cover_photo_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...)
):
    """
    POST /api/v1/artist-profiles/me/cover-photo
    """
    artist_profile = (
        db.query(Artist)
          .filter(Artist.user_id == current_user.id)
          .first()
    )
    if not artist_profile:
        raise HTTPException(status_code=404, detail="Artist profile not found.")

    if file.content_type not in ALLOWED_PROFILE_PIC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image type. Allowed: {ALLOWED_PROFILE_PIC_TYPES}"
        )

    try:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original = Path(file.filename or "cover").name
        sanitized = re.sub(r"[^a-zA-Z0-9_.-]", "_", original)
        unique_filename = f"{timestamp}_{current_user.id}_{sanitized}"

        file_path = COVER_PHOTOS_DIR / unique_filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Delete old cover photo if it exists
        if artist_profile.cover_photo_url:
            old_rel = artist_profile.cover_photo_url.replace("/static/", "", 1)
            old_file = STATIC_DIR / old_rel
            if old_file.exists() and old_file != file_path:
                try:
                    old_file.unlink()
                except OSError as e:
                    logger.warning("Error deleting old cover photo %s: %s", old_file, e)

        artist_profile.cover_photo_url = f"/static/cover_photos/{unique_filename}"
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)

        return artist_profile

    except Exception as e:
        if 'file_path' in locals() and file_path.exists():
            try:
                file_path.unlink()
            except OSError as cleanup_err:
                logger.warning("Error cleaning up cover photo %s: %s", file_path, cleanup_err)
        raise HTTPException(status_code=500, detail=f"Could not upload cover photo: {e}")

    finally:
        await file.close()


@router.post(
    "/me/portfolio-images",
    response_model=ArtistProfileResponse,
    summary="Upload portfolio images",
    description="Upload one or more portfolio images and append them to the artist's portfolio_image_urls list.",
)
async def upload_artist_portfolio_images_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    files: List[UploadFile] = File(...),
):
    """POST /api/v1/artist-profiles/me/portfolio-images"""
    artist_profile = (
        db.query(Artist)
          .filter(Artist.user_id == current_user.id)
          .first()
    )
    if not artist_profile:
        raise HTTPException(status_code=404, detail="Artist profile not found.")

    new_urls = list(artist_profile.portfolio_image_urls or [])
    try:
        for up in files:
            if up.content_type not in ALLOWED_PORTFOLIO_IMAGE_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid image type. Allowed: {ALLOWED_PORTFOLIO_IMAGE_TYPES}",
                )
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            original = Path(up.filename or "portfolio").name
            sanitized = re.sub(r"[^a-zA-Z0-9_.-]", "_", original)
            unique_filename = f"{timestamp}_{current_user.id}_{sanitized}"
            file_path = PORTFOLIO_IMAGES_DIR / unique_filename
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(up.file, buffer)
            new_urls.append(f"/static/portfolio_images/{unique_filename}")

        artist_profile.portfolio_image_urls = new_urls
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)
        return artist_profile
    except Exception as e:
        if 'file_path' in locals() and file_path.exists():
            try:
                file_path.unlink()
            except OSError as cleanup_err:
                logger.warning("Error cleaning up portfolio image %s: %s", file_path, cleanup_err)
        raise HTTPException(status_code=500, detail=f"Could not upload portfolio image: {e}")
    finally:
        for up in files:
            await up.close()


class PortfolioImagesUpdate(BaseModel):
    portfolio_image_urls: List[str]


@router.put(
    "/me/portfolio-images",
    response_model=ArtistProfileResponse,
    summary="Update portfolio image order",
    description="Replace portfolio_image_urls with the provided list to reorder images.",
)
def update_portfolio_images_order_me(
    update: PortfolioImagesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """PUT /api/v1/artist-profiles/me/portfolio-images"""
    artist_profile = (
        db.query(Artist)
          .filter(Artist.user_id == current_user.id)
          .first()
    )
    if not artist_profile:
        raise HTTPException(status_code=404, detail="Artist profile not found.")

    artist_profile.portfolio_image_urls = update.portfolio_image_urls
    db.add(artist_profile)
    db.commit()
    db.refresh(artist_profile)
    return artist_profile


@router.get(
    "/",
    response_model=ArtistListResponse,
    summary="List all artist profiles",
    description="Return a paginated list of artist profiles.",
)
def read_all_artist_profiles(
    db: Session = Depends(get_db),
    category: Optional[ServiceType] = Query(None),
    location: Optional[str] = Query(None),
    sort: Optional[str] = Query(None, pattern="^(top_rated|most_booked|newest)$"),
    min_price: Optional[float] = Query(None, alias="minPrice", ge=0),
    max_price: Optional[float] = Query(None, alias="maxPrice", ge=0),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    include_price_distribution: bool = Query(False, alias="include_price_distribution"),
):
    """Return a list of all artist profiles with optional filters."""

    # FastAPI's Query objects appear when this function is called directly in tests.
    # Normalize them to plain values for compatibility.
    if hasattr(min_price, "default"):
        min_price = None
    if hasattr(max_price, "default"):
        max_price = None
    if hasattr(include_price_distribution, "default"):
        include_price_distribution = False

    cache_category = category.value if isinstance(category, ServiceType) else category
    cached = None
    if not include_price_distribution:
        cached = get_cached_artist_list(
            page=page,
            limit=limit,
            category=cache_category,
            location=location,
            sort=sort,
            min_price=min_price,
            max_price=max_price,
        )
    if cached is not None:
        return {
            "data": [ArtistProfileResponse.model_validate(item) for item in cached],
            "total": len(cached),
            "price_distribution": [],
        }

    rating_subq = (
        db.query(
            Review.artist_id.label("artist_id"),
            func.avg(Review.rating).label("rating"),
            func.count(Review.id).label("rating_count"),
        )
        .group_by(Review.artist_id)
        .subquery()
    )
    booking_subq = (
        db.query(
            Booking.artist_id.label("artist_id"),
            func.count(Booking.id).label("book_count"),
        )
        .group_by(Booking.artist_id)
        .subquery()
    )

    query = (
        db.query(
            Artist,
            rating_subq.c.rating,
            rating_subq.c.rating_count,
            booking_subq.c.book_count,
        )
        .outerjoin(rating_subq, rating_subq.c.artist_id == Artist.user_id)
        .outerjoin(booking_subq, booking_subq.c.artist_id == Artist.user_id)
    )

    join_services = False
    service_price_col = None
    if category or min_price is not None or max_price is not None:
        price_subq = (
            db.query(
                Service.artist_id.label("artist_id"),
                func.min(Service.price).label("service_price"),
            )
            .group_by(Service.artist_id)
            .subquery()
        )
        query = query.join(Service).join(price_subq, price_subq.c.artist_id == Artist.user_id)
        query = query.add_columns(price_subq.c.service_price)
        service_price_col = price_subq.c.service_price
        join_services = True
    if category:
        query = query.filter(Service.service_type == category)
    if min_price is not None:
        query = query.filter(Service.price >= min_price)
    if max_price is not None:
        query = query.filter(Service.price <= max_price)
    if join_services:
        query = query.group_by(
            Artist.user_id,
            rating_subq.c.rating,
            rating_subq.c.rating_count,
            booking_subq.c.book_count,
        )

    if location:
        query = query.filter(Artist.location.ilike(f"%{location}%"))

    if sort == "top_rated":
        query = query.order_by(desc(rating_subq.c.rating))
    elif sort == "most_booked":
        query = query.order_by(desc(booking_subq.c.book_count))
    elif sort == "newest":
        query = query.order_by(desc(Artist.created_at))

    all_rows = query.all()
    total_count = len(all_rows)

    price_distribution_data: List[Dict[str, Any]] = []
    if include_price_distribution:
        bucket_counts: Dict[Tuple[int, int], int] = defaultdict(int)
        for row in all_rows:
            if join_services:
                _, _, _, _, service_price = row
            else:
                _, _, _, _ = row
                service_price = None
            if service_price is not None:
                for b_min, b_max in PRICE_BUCKETS:
                    if b_min <= service_price <= b_max:
                        bucket_counts[(b_min, b_max)] += 1
                        break
        for b_min, b_max in PRICE_BUCKETS:
            price_distribution_data.append({
                "min": b_min,
                "max": b_max,
                "count": bucket_counts.get((b_min, b_max), 0),
            })

    offset = (page - 1) * limit
    artists = all_rows[offset: offset + limit]

    profiles: List[ArtistProfileResponse] = []
    for row in artists:
        if join_services:
            artist, rating, rating_count, book_count, service_price = row
        else:
            artist, rating, rating_count, book_count = row
            service_price = None
        profile = ArtistProfileResponse.model_validate(
            {
                **artist.__dict__,
                "rating": float(rating) if rating is not None else None,
                "rating_count": int(rating_count or 0),
                "service_price": float(service_price) if service_price is not None else None,
            }
        )
        availability = read_artist_availability(artist.user_id, db)
        profile.is_available = len(availability["unavailable_dates"]) == 0
        profiles.append(profile)

    if not include_price_distribution:
        cache_artist_list(
            [
                {**profile.model_dump(), "user_id": profile.user_id}
                for profile in profiles
            ],
            page=page,
            limit=limit,
            category=cache_category,
            location=location,
            sort=sort,
            min_price=min_price,
            max_price=max_price,
        )

    return {
        "data": profiles,
        "total": total_count,
        "price_distribution": price_distribution_data,
    }

@router.get("/{artist_id}", response_model=ArtistProfileResponse)
def read_artist_profile_by_id(artist_id: int, db: Session = Depends(get_db)):
    artist = db.query(Artist).filter(Artist.user_id == artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist profile not found.")
    return artist


@router.get("/{artist_id}/availability", response_model=ArtistAvailabilityResponse)
def read_artist_availability(artist_id: int, db: Session = Depends(get_db)):
    """Return dates the artist is unavailable."""
    bookings = (
        db.query(Booking)
        .filter(
            Booking.artist_id == artist_id,
            Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
        )
        .all()
    )
    requests = (
        db.query(BookingRequest)
        .filter(
            BookingRequest.artist_id == artist_id,
            BookingRequest.status != BookingRequestStatus.REQUEST_DECLINED,
        )
        .all()
    )

    dates = set()
    for b in bookings:
        dates.add(b.start_time.date().isoformat())
    for r in requests:
        if r.proposed_datetime_1:
            dates.add(r.proposed_datetime_1.date().isoformat())
        if r.proposed_datetime_2:
            dates.add(r.proposed_datetime_2.date().isoformat())

    start = datetime.utcnow()
    end = start + timedelta(days=365)
    try:
        for ev in calendar_service.fetch_events(artist_id, start, end, db):
            dates.add(ev.date().isoformat())
    except HTTPException:
        pass

    return {"unavailable_dates": sorted(dates)}

def read_all_artists(db: Session = Depends(get_db)):
    """
    GET /api/v1/artist-profiles
    """
    artists = db.query(Artist).all()
    return artists
