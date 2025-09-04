# app/api/v1/api_service_provider.py

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query, Response
from fastapi.params import Query as QueryParam
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, or_
from collections import defaultdict
from datetime import datetime, timedelta, date
import logging
import hashlib
import json
import re
import shutil
from pathlib import Path
import base64
from typing import List, Optional, Tuple, Dict, Any
import os
import base64
from pydantic import BaseModel

from app.utils.redis_cache import (
    get_cached_artist_list,
    cache_artist_list,
    get_cached_availability,
    cache_availability,
)
from app.services import calendar_service

from app.database import get_db
from app.models.user import User
from app.models.service_provider_profile import ServiceProviderProfile as Artist
from app.models.booking import Booking
from app.models.booking_status import BookingStatus
from app.models.request_quote import BookingRequest
from app.models.service import Service
from app.models.service_category import ServiceCategory
from app.models.review import Review
from app.schemas.artist import (
    ArtistProfileResponse,
    ArtistProfileUpdate,  # new Pydantic schema for updates
    ArtistAvailabilityResponse,
    ArtistListResponse,
)
from app.utils.profile import is_artist_profile_complete
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


@router.get(
    "/me", response_model=ArtistProfileResponse, response_model_exclude_none=True
)
def read_current_artist_profile(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    GET /api/v1/service-provider-profiles/me
    Returns the profile of the currently authenticated artist.
    """
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist_profile:
        raise HTTPException(
            status_code=404,
            detail="Artist profile not found.",
        )
    # Opportunistic migration: convert legacy file paths to data URLs so media
    # survives redeploys, mirroring AddServiceModalMusician behavior.
    try:
        changed = False
        # Helper to convert a single relative path under /static to data URL
        def to_data_url_if_exists(rel_path: str | None) -> Optional[str]:
            if not rel_path:
                return rel_path
            p = str(rel_path)
            if p.startswith('/static/'):
                rel = p.replace('/static/', '', 1)
                fs_path = STATIC_DIR / rel
                if fs_path.exists() and fs_path.is_file():
                    mime = 'image/jpeg'
                    ext = fs_path.suffix.lower()
                    if ext in {'.png'}:
                        mime = 'image/png'
                    elif ext in {'.webp'}:
                        mime = 'image/webp'
                    elif ext in {'.svg'}:
                        mime = 'image/svg+xml'
                    try:
                        data = fs_path.read_bytes()
                        b64 = base64.b64encode(data).decode('ascii')
                        return f'data:{mime};base64,{b64}'
                    except Exception:
                        return rel_path
            return rel_path

        # Profile picture
        new_pp = to_data_url_if_exists(artist_profile.profile_picture_url)
        if new_pp != artist_profile.profile_picture_url:
            artist_profile.profile_picture_url = new_pp
            changed = True
        # Cover photo
        new_cover = to_data_url_if_exists(artist_profile.cover_photo_url)
        if new_cover != artist_profile.cover_photo_url:
            artist_profile.cover_photo_url = new_cover
            changed = True
        # Portfolio images
        if artist_profile.portfolio_image_urls:
            new_list: List[str] = []
            list_changed = False
            for url in artist_profile.portfolio_image_urls:
                new_url = to_data_url_if_exists(url)
                new_list.append(new_url)
                if new_url != url:
                    list_changed = True
            if list_changed:
                artist_profile.portfolio_image_urls = new_list
                changed = True
        if changed:
            db.add(artist_profile)
            db.commit()
            db.refresh(artist_profile)
    except Exception:
        # Non-fatal: return profile even if migration failed
        pass

    return artist_profile


@router.put(
    "/me",
    response_model=ArtistProfileResponse,
    response_model_exclude_none=True,
    summary="Update current artist's profile",
    description=("Update fields of the currently authenticated artist's profile."),
)
def update_current_artist_profile(
    profile_in: ArtistProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    PUT /api/v1/service-provider-profiles/me
    Allows the authenticated artist to update their own profile fields.
    """
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist_profile:
        raise HTTPException(
            status_code=404,
            detail="Artist profile not found.",
        )

    update_data = profile_in.model_dump(exclude_unset=True)

    # Convert Pydantic HttpUrl objects to plain strings for JSON columns
    if "portfolio_urls" in update_data and update_data["portfolio_urls"] is not None:
        update_data["portfolio_urls"] = [
            str(url) for url in update_data["portfolio_urls"]
        ]

    if (
        "profile_picture_url" in update_data
        and update_data["profile_picture_url"] is not None
    ):
        update_data["profile_picture_url"] = str(update_data["profile_picture_url"])

    for field, value in update_data.items():
        setattr(artist_profile, field, value)

    db.add(artist_profile)
    db.commit()
    db.refresh(artist_profile)
    # Auto-mark onboarding as completed when the profile meets requirements
    try:
        if not artist_profile.onboarding_completed and is_artist_profile_complete(artist_profile):
            artist_profile.onboarding_completed = True
            db.add(artist_profile)
            db.commit()
            db.refresh(artist_profile)
    except Exception:
        # Non-fatal; if this fails, service creation still enforces completion.
        pass
    return artist_profile


@router.post(
    "/me/profile-picture",
    response_model=ArtistProfileResponse,
    response_model_exclude_none=True,
    summary="Upload or update current artist's profile picture",
    description=(
        "Uploads a new profile picture for the currently authenticated artist,"
        " replacing any existing one."
    ),
)
async def upload_artist_profile_picture_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """
    POST /api/v1/service-provider-profiles/me/profile-picture
    """
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist_profile:
        raise HTTPException(
            status_code=404,
            detail="Artist profile not found.",
        )

    if file.content_type not in ALLOWED_PROFILE_PIC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(f"Invalid image type. Allowed: {ALLOWED_PROFILE_PIC_TYPES}"),
        )

    try:
        # Store as data URL in DB to survive redeploys (same approach as service.media_url)
        content = await file.read()
        b64 = base64.b64encode(content).decode("ascii")
        mime = file.content_type or "image/jpeg"
        data_url = f"data:{mime};base64,{b64}"

        # Best-effort cleanup for legacy file-based URLs
        if artist_profile.profile_picture_url and artist_profile.profile_picture_url.startswith("/static/"):
            old_rel = artist_profile.profile_picture_url.replace("/static/", "", 1)
            old_file = STATIC_DIR / old_rel
            if old_file.exists():
                try:
                    old_file.unlink()
                except OSError as e:
                    logger.warning("Error deleting old profile picture %s: %s", old_file, e)

        artist_profile.profile_picture_url = data_url
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)

        return artist_profile

    except Exception as e:
        if "file_path" in locals() and file_path.exists():
            try:
                file_path.unlink()
            except OSError as cleanup_err:
                logger.warning(
                    "Error cleaning up profile picture %s: %s", file_path, cleanup_err
                )
        raise HTTPException(
            status_code=500, detail=f"Could not upload profile picture: {e}"
        )

    finally:
        await file.close()


@router.post(
    "/me/cover-photo",
    response_model=ArtistProfileResponse,
    response_model_exclude_none=True,
    summary="Upload or update current artist's cover photo",
    description="Uploads a new cover photo for the currently authenticated artist, replacing any existing one.",
)
async def upload_artist_cover_photo_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """
    POST /api/v1/service-provider-profiles/me/cover-photo
    """
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist_profile:
        raise HTTPException(status_code=404, detail="Artist profile not found.")

    if file.content_type not in ALLOWED_PROFILE_PIC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image type. Allowed: {ALLOWED_PROFILE_PIC_TYPES}",
        )

    try:
        # Store as data URL to persist across redeploys
        content = await file.read()
        b64 = base64.b64encode(content).decode("ascii")
        mime = file.content_type or "image/jpeg"
        data_url = f"data:{mime};base64,{b64}"

        # Best-effort cleanup for legacy file-based URLs
        if artist_profile.cover_photo_url and artist_profile.cover_photo_url.startswith("/static/"):
            old_rel = artist_profile.cover_photo_url.replace("/static/", "", 1)
            old_file = STATIC_DIR / old_rel
            if old_file.exists():
                try:
                    old_file.unlink()
                except OSError as e:
                    logger.warning("Error deleting old cover photo %s: %s", old_file, e)

        artist_profile.cover_photo_url = data_url
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)

        return artist_profile

    except Exception as e:
        if "file_path" in locals() and file_path.exists():
            try:
                file_path.unlink()
            except OSError as cleanup_err:
                logger.warning(
                    "Error cleaning up cover photo %s: %s", file_path, cleanup_err
                )
        raise HTTPException(
            status_code=500, detail=f"Could not upload cover photo: {e}"
        )

    finally:
        await file.close()


@router.post(
    "/me/portfolio-images",
    response_model=ArtistProfileResponse,
    response_model_exclude_none=True,
    summary="Upload portfolio images",
    description="Upload one or more portfolio images and append them to the artist's portfolio_image_urls list.",
)
async def upload_artist_portfolio_images_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    files: List[UploadFile] = File(...),
):
    """POST /api/v1/service-provider-profiles/me/portfolio-images"""
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
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
            content = await up.read()
            b64 = base64.b64encode(content).decode("ascii")
            mime = up.content_type or "image/jpeg"
            data_url = f"data:{mime};base64,{b64}"
            new_urls.append(data_url)

        artist_profile.portfolio_image_urls = new_urls
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)
        return artist_profile
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Could not upload portfolio image: {e}"
        )
    finally:
        for up in files:
            await up.close()


class PortfolioImagesUpdate(BaseModel):
    portfolio_image_urls: List[str]


@router.put(
    "/me/portfolio-images",
    response_model=ArtistProfileResponse,
    response_model_exclude_none=True,
    summary="Update portfolio image order",
    description="Replace portfolio_image_urls with the provided list to reorder images.",
)
def update_portfolio_images_order_me(
    update: PortfolioImagesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """PUT /api/v1/service-provider-profiles/me/portfolio-images"""
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
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
    response_model_exclude_none=True,
    summary="List all service provider profiles",
    description="Return a paginated list of service provider profiles.",
)
def read_all_service_provider_profiles(
    response: Response,
    db: Session = Depends(get_db),
    # Accept category as a string so unknown values (e.g. "Musician")
    # don't trigger a validation error. We'll attempt to coerce it to
    # ``ServiceType`` below and ignore it if it's not a known value.
    category: Optional[str] = Query(None, description="Filter by service category"),
    location: Optional[str] = Query(None),
    sort: Optional[str] = Query(None, pattern="^(top_rated|most_booked|newest)$"),
    when: Optional[date] = Query(None),
    min_price: Optional[float] = Query(None, alias="minPrice", ge=0),
    max_price: Optional[float] = Query(None, alias="maxPrice", ge=0),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    include_price_distribution: bool = Query(False, alias="include_price_distribution"),
    artist: Optional[str] = Query(None, description="Filter by artist name"),
    fields: Optional[str] = Query(None, description="Comma-separated fields to include. Trims payload."),
):
    """Return a list of all service provider profiles with optional filters."""

    # FastAPI's Query objects appear when this function is called directly in tests.
    # Normalize them to plain values for compatibility.
    if hasattr(min_price, "default"):
        min_price = None
    if hasattr(max_price, "default"):
        max_price = None
    if hasattr(include_price_distribution, "default"):
        include_price_distribution = False
    if hasattr(category, "default"):
        category = None
    if hasattr(location, "default"):
        location = None
    if hasattr(sort, "default"):
        sort = None
    if hasattr(when, "default"):
        when = None
    if hasattr(artist, "default"):
        artist = None

    # Normalize ``category`` to a slug (e.g. "videographer") so the filter works
    # regardless of whether the frontend sends "Videographer" or "videographer".
    category_slug: Optional[str] = None
    category_provided = isinstance(category, str) and category
    if category_provided:
        category_slug = category.lower().replace(" ", "_")
        normalized_name = category_slug.replace("_", " ")
        exists = (
            db.query(ServiceCategory.id)
            .filter(func.lower(ServiceCategory.name) == normalized_name)
            .first()
        )
        if not exists:
            return {
                "data": [],
                "total": 0,
                "price_distribution": [],
            }

    cache_category = category_slug
    cached = None
    cacheable = (not include_price_distribution) and (when is None) and (not artist)
    if cacheable:
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
        try:
            etag = 'W/"' + hashlib.sha256(json.dumps(cached, separators=(",", ":"), sort_keys=True).encode("utf-8")).hexdigest() + '"'
        except Exception:
            etag = None
        # Shared-cache friendly headers for hot list paths
        response.headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=300"
        if etag:
            response.headers["ETag"] = etag
        response.headers["X-Cache"] = "HIT"
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
    category_subq = (
        db.query(
            Service.artist_id.label("artist_id"),
            func.group_concat(ServiceCategory.name, ",").label("service_categories"),
        )
        .join(ServiceCategory, Service.service_category_id == ServiceCategory.id)
        .filter(getattr(Service, "status", "approved") == "approved")
        .group_by(Service.artist_id)
        .subquery()
    )

    query = (
        db.query(
            Artist,
            rating_subq.c.rating,
            rating_subq.c.rating_count,
            booking_subq.c.book_count,
            category_subq.c.service_categories,
        )
        .options(joinedload(Artist.user))
        .outerjoin(rating_subq, rating_subq.c.artist_id == Artist.user_id)
        .outerjoin(booking_subq, booking_subq.c.artist_id == Artist.user_id)
        .outerjoin(category_subq, category_subq.c.artist_id == Artist.user_id)
    )
    # Exclude service providers who have not added any APPROVED services.
    query = query.filter(Artist.services.any(Service.status == "approved"))
    if artist:
        query = query.join(User).filter(
            or_(
                Artist.business_name.ilike(f"%{artist}%"),
                User.first_name.ilike(f"%{artist}%"),
                User.last_name.ilike(f"%{artist}%"),
            )
        )

    join_services = False
    service_price_col = None
    if category_slug or min_price is not None or max_price is not None:
        price_query = db.query(
            Service.artist_id.label("artist_id"),
            func.min(Service.price).label("service_price"),
        ).filter(getattr(Service, "status", "approved") == "approved")
        if category_slug:
            price_query = price_query.join(Service.service_category).filter(
                func.lower(ServiceCategory.name) == category_slug.replace("_", " ")
            )
        price_subq = price_query.group_by(Service.artist_id).subquery()
        query = query.join(price_subq, price_subq.c.artist_id == Artist.user_id)
        query = query.add_columns(price_subq.c.service_price)
        service_price_col = price_subq.c.service_price
        join_services = True
    if min_price is not None:
        query = query.filter(service_price_col >= min_price)
    if max_price is not None:
        query = query.filter(service_price_col <= max_price)
    if join_services:
        query = query.group_by(
            Artist.user_id,
            rating_subq.c.rating,
            rating_subq.c.rating_count,
            booking_subq.c.book_count,
            category_subq.c.service_categories,
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
            # ``row`` can contain either 5 or 6 items depending on whether
            # service prices were joined above.  We only care about the
            # ``service_price`` column here, so grab the last element when the
            # join is active instead of unpacking a fixed number of values.
            service_price = row[-1] if join_services else None

            if service_price is not None:
                for b_min, b_max in PRICE_BUCKETS:
                    if b_min <= service_price <= b_max:
                        bucket_counts[(b_min, b_max)] += 1
                        break
        for b_min, b_max in PRICE_BUCKETS:
            price_distribution_data.append(
                {
                    "min": b_min,
                    "max": b_max,
                    "count": bucket_counts.get((b_min, b_max), 0),
                }
            )

    offset = (page - 1) * limit
    artists = all_rows[offset : offset + limit]

    # Helper to scrub heavy inline images from list payloads
    def _scrub_image(val: Optional[str]) -> Optional[str]:
        try:
            if isinstance(val, str) and val.startswith("data:") and len(val) > 1000:
                return None
        except Exception:
            pass
        return val

    requested: Optional[set[str]] = None
    if isinstance(fields, str) and fields.strip():
        requested = {f.strip() for f in fields.split(",") if f.strip()}

    profiles: List[ArtistProfileResponse] = []
    for row in artists:
        if join_services:
            artist, rating, rating_count, book_count, category_names, service_price = (
                row
            )
        else:
            artist, rating, rating_count, book_count, category_names = row
            service_price = None
        categories = (
            sorted(set(category_names.split(","))) if category_names is not None else []
        )
        # Access the related User to ensure it's loaded for downstream filters
        _ = artist.user
        # Build a lean dict and scrub oversized base64 images for list usage
        base = {
            **artist.__dict__,
            "rating": float(rating) if rating is not None else None,
            "rating_count": int(rating_count or 0),
            "service_price": (float(service_price) if service_price is not None else None),
            "service_categories": categories,
        }
        # Preserve profile_picture_url even if it's a data URL so list views
        # (e.g., homepage carousels) can show the cropped avatar without
        # depending on static storage. Covers/portfolios are excluded below.
        # base["profile_picture_url"] remains as stored.
        # Exclude heavy fields by default; clients can request explicitly via `fields`
        base["portfolio_image_urls"] = None
        base["cover_photo_url"] = None
        if requested is not None:
            always_keep = {"user_id", "created_at", "updated_at"}
            base = {k: v for k, v in base.items() if (k in requested) or (k in always_keep)}
        profile = ArtistProfileResponse.model_validate(base)
        # Avoid per-artist availability lookups for list pages without a specific date
        if when:
            availability = read_artist_availability(
                artist.user_id,
                when=when,
                db=db,
            )
            profile.is_available = (when.isoformat() not in availability["unavailable_dates"]) 
        else:
            # Default to available when no specific date filter is applied to keep the list fast
            profile.is_available = True
        profiles.append(profile)

    if when:
        profiles = [p for p in profiles if p.is_available]
        total_count = len(profiles)

    # When browsing the DJ category, filter out placeholder legacy records
    # that were imported from older systems. These entries usually have a
    # business name that exactly matches the user's full name and lack any
    # profile details such as a description or profile picture. Legitimate
    # DJs often brand themselves with their given names, so we only exclude
    # profiles that *also* have no substantive content.
    if category_slug == "dj":

        def _is_placeholder(p: ArtistProfileResponse) -> bool:
            full_name = (
                (f"{p.user.first_name} {p.user.last_name}" if p.user else "")
                .strip()
                .lower()
            )
            business = (p.business_name or "").strip().lower()
            matches_name = business == full_name or business == ""
            has_profile = any(
                [
                    p.profile_picture_url,
                    p.description,
                    p.portfolio_image_urls,
                    p.custom_subtitle,
                ]
            )
            return matches_name and not has_profile

        profiles = [p for p in profiles if not _is_placeholder(p)]
        total_count = len(profiles)

    if cacheable:
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

    # Set caching headers on the response
    if cacheable:
        try:
            # Serialize a compact representation for ETag stability
            payload = [p.model_dump() for p in profiles]
            etag = 'W/"' + hashlib.sha256(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")).hexdigest() + '"'
        except Exception:
            etag = None
        response.headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=300"
        if etag:
            response.headers["ETag"] = etag
        response.headers["X-Cache"] = "MISS"
    else:
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Cache"] = "BYPASS"

    return {
        "data": profiles,
        "total": total_count,
        "price_distribution": price_distribution_data,
    }


@router.get(
    "/{artist_id}",
    response_model=ArtistProfileResponse,
    response_model_exclude_none=True,
)
def read_artist_profile_by_id(artist_id: int, db: Session = Depends(get_db)):
    artist = db.query(Artist).filter(Artist.user_id == artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist profile not found.")
    return artist


@router.get(
    "/{artist_id}/availability",
    response_model=ArtistAvailabilityResponse,
    response_model_exclude_none=True,
)
def read_artist_availability(
    artist_id: int,
    when: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    """Return dates the artist is unavailable."""
    if isinstance(when, QueryParam):
        when = when.default

    cached = get_cached_availability(artist_id, when)
    if cached:
        return cached

    bookings_query = db.query(Booking).filter(
        Booking.artist_id == artist_id,
        Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
    )
    if when:
        day_start = datetime.combine(when, datetime.min.time())
        day_end = day_start + timedelta(days=1)
        bookings_query = bookings_query.filter(
            Booking.start_time >= day_start, Booking.start_time < day_end
        )
    bookings = bookings_query.all()

    requests_query = db.query(BookingRequest).filter(
        BookingRequest.artist_id == artist_id,
        BookingRequest.status != BookingStatus.REQUEST_DECLINED,
    )
    if when:
        requests_query = requests_query.filter(
            (
                (BookingRequest.proposed_datetime_1 >= day_start)
                & (BookingRequest.proposed_datetime_1 < day_end)
            )
            | (
                (BookingRequest.proposed_datetime_2 >= day_start)
                & (BookingRequest.proposed_datetime_2 < day_end)
            )
        )
    requests = requests_query.all()

    dates = set()
    for b in bookings:
        dates.add(b.start_time.date().isoformat())
    for r in requests:
        if r.proposed_datetime_1:
            dates.add(r.proposed_datetime_1.date().isoformat())
        if r.proposed_datetime_2:
            dates.add(r.proposed_datetime_2.date().isoformat())

    if when:
        start = datetime.combine(when, datetime.min.time())
        end = start + timedelta(days=1)
    else:
        start = datetime.utcnow()
        end = start + timedelta(days=365)
    try:
        for ev in calendar_service.fetch_events(artist_id, start, end, db):
            dates.add(ev.date().isoformat())
    except HTTPException:
        pass
    result = {"unavailable_dates": sorted(dates)}
    cache_availability(result, artist_id, when)
    return result


@router.get(
    "/",
    response_model=ArtistListResponse,
    response_model_exclude_none=True,
    summary="List service provider profiles (paginated)",
)
def list_service_provider_profiles(
    response: Response,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
    category: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    sort: Optional[str] = Query(None, description="Sort by 'price_asc' | 'price_desc' | 'rating_desc' | 'recent'"),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    include_price_distribution: bool = Query(False),
    fields: Optional[str] = Query(None, description="Comma-separated fields to include. Trims payload."),
):
    cached = get_cached_artist_list(
        page,
        limit=limit,
        category=category,
        location=location,
        sort=sort,
        min_price=min_price,
        max_price=max_price,
    )
    if isinstance(cached, dict) and "data" in cached and "total" in cached:
        response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=120"
        return cached

    min_price_subq = (
        db.query(Service.artist_id.label("artist_id"), func.min(Service.price).label("min_price"))
        .filter(getattr(Service, "status", "approved") == "approved")
        .group_by(Service.artist_id)
        .subquery()
    )

    q = (
        db.query(Artist, min_price_subq.c.min_price)
        .outerjoin(min_price_subq, Artist.user_id == min_price_subq.c.artist_id)
    )
    # Hide providers with zero approved services
    q = q.filter(Artist.services.any(Service.status == "approved"))

    if category:
        q = q.join(Service, Service.artist_id == Artist.user_id)
        q = q.join(ServiceCategory, Service.service_category_id == ServiceCategory.id)
        q = q.filter(getattr(Service, "status", "approved") == "approved")
        q = q.filter(func.lower(ServiceCategory.name) == category.lower())
    if location:
        q = q.filter(Artist.location.ilike(f"%{location}%"))
    if min_price is not None:
        q = q.filter((min_price_subq.c.min_price == None) | (min_price_subq.c.min_price >= min_price))
    if max_price is not None:
        q = q.filter((min_price_subq.c.min_price == None) | (min_price_subq.c.min_price <= max_price))

    if sort == "price_asc":
        q = q.order_by(min_price_subq.c.min_price.asc().nulls_last())
    elif sort == "price_desc":
        q = q.order_by(min_price_subq.c.min_price.desc().nulls_last())
    else:
        q = q.order_by(Artist.updated_at.desc())

    total = q.count()
    rows = q.offset((page - 1) * limit).limit(limit).all()

    # Helper: scrub overly large inline images (data URLs) to keep payload small
    def _scrub_image(val: Optional[str]) -> Optional[str]:
        try:
            if isinstance(val, str) and val.startswith("data:"):
                # If it's a large inline data URL, drop it for list views
                if len(val) > 1000:
                    return None
        except Exception:
            pass
        return val

    requested: Optional[set[str]] = None
    if isinstance(fields, str) and fields.strip():
        requested = {f.strip() for f in fields.split(",") if f.strip()}

    data = []
    for artist, minp in rows:
        record = {
            "user_id": artist.user_id,
            "business_name": artist.business_name,
            "custom_subtitle": artist.custom_subtitle,
            # Large fields intentionally omitted unless requested
            "description": artist.description,
            "location": artist.location,
            "hourly_rate": str(artist.hourly_rate) if artist.hourly_rate is not None else None,
            "portfolio_urls": artist.portfolio_urls,
            # portfolio_image_urls and cover_photo_url may contain data URLs; exclude by default
            "portfolio_image_urls": None,
            "specialties": artist.specialties,
            # Keep profile picture as-is, including data URLs, to ensure
            # durability across deploys for avatars on lightweight lists
            "profile_picture_url": artist.profile_picture_url,
            "cover_photo_url": None,
            "price_visible": artist.price_visible,
            "cancellation_policy": artist.cancellation_policy,
            "contact_email": artist.contact_email,
            "contact_phone": artist.contact_phone,
            "contact_website": artist.contact_website,
            "created_at": artist.created_at.isoformat(),
            "updated_at": artist.updated_at.isoformat(),
            "rating": None,
            "rating_count": 0,
            "is_available": None,
            "service_price": float(minp) if minp is not None else None,
            "service_categories": [],
            "onboarding_completed": getattr(artist, "onboarding_completed", None),
            "user": None,
        }
        if requested is not None:
            # Do NOT include a nested user object in this lean list response to
            # avoid mismatches with the strict UserResponse schema. The full
            # list endpoint above returns proper nested users when needed.
            always_keep = {"user_id", "created_at", "updated_at"}
            record = {k: v for k, v in record.items() if (k in requested) or (k in always_keep)}
        data.append(record)

    price_distribution = []
    if include_price_distribution:
        buckets = PRICE_BUCKETS
        counts = [0 for _ in buckets]
        all_min_prices = [
            float(p or 0)
            for p, in db.query(func.min(Service.price))
            .filter(getattr(Service, "status", "approved") == "approved")
            .group_by(Service.artist_id)
            .all()
        ]
        for price in all_min_prices:
            for idx, (lo, hi) in enumerate(buckets):
                if lo <= price <= hi:
                    counts[idx] += 1
                    break
        price_distribution = [{"min": lo, "max": hi, "count": cnt} for (lo, hi), cnt in zip(buckets, counts)]

    payload = {"data": data, "total": int(total), "price_distribution": price_distribution}

    try:
        cache_artist_list(
            payload,
            page,
            limit=limit,
            category=category,
            location=location,
            sort=sort,
            min_price=min_price,
            max_price=max_price,
            expire=60,
        )
    except Exception:
        pass

    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=120"
    return payload
