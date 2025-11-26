# app/api/v1/api_service_provider.py

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query, Response, Request
from fastapi.encoders import jsonable_encoder
from fastapi.params import Query as QueryParam
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from collections import defaultdict
from datetime import datetime, timedelta, date
import logging
import hashlib
import json
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any
from pydantic import BaseModel
from io import BytesIO
try:  # optional for schema generation
    from PIL import Image  # type: ignore
except Exception:  # pragma: no cover - optional
    Image = None  # type: ignore

from app.utils.redis_cache import (
    get_cached_artist_list,
    cache_artist_list,
    get_cached_availability,
    cache_availability,
)
from app.services import calendar_service
from app.utils.slug import slugify_name, generate_unique_slug

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
from app.utils import r2 as r2utils
from app.schemas.storage import PresignOut

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
    # Completed / cancelled events counts for this provider
    try:
        completed_count = (
            db.query(Booking)
            .filter(
                Booking.artist_id == int(current_user.id),
                Booking.status == BookingStatus.COMPLETED,
            )
            .count()
        )
        cancelled_count = (
            db.query(Booking)
            .filter(
                Booking.artist_id == int(current_user.id),
                Booking.status == BookingStatus.CANCELLED,
            )
            .count()
        )
        setattr(artist_profile, "completed_events", int(completed_count))
        setattr(artist_profile, "cancelled_events", int(cancelled_count))
    except Exception:
        setattr(artist_profile, "completed_events", 0)
        setattr(artist_profile, "cancelled_events", 0)

    # Aggregate rating + review count for this provider so profile panels
    # can display an accurate "reviews" badge alongside the reviews list.
    try:
        rating_row = (
            db.query(func.avg(Review.rating), func.count(Review.id))
            .filter(Review.artist_id == int(current_user.id))
            .first()
        )
        if rating_row is not None:
            avg_rating, rating_count = rating_row
            setattr(
                artist_profile,
                "rating",
                float(avg_rating) if avg_rating is not None else None,
            )
            setattr(
                artist_profile,
                "rating_count",
                int(rating_count or 0),
            )
    except Exception:
        # Leave default rating / rating_count on error
        pass

    # Defensive: ensure timestamps present for response validation
    try:
        from datetime import datetime as _dt
        if not getattr(artist_profile, "created_at", None):
            artist_profile.created_at = getattr(artist_profile, "updated_at", None) or _dt.utcnow()
        if not getattr(artist_profile, "updated_at", None):
            artist_profile.updated_at = artist_profile.created_at
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)
    except Exception:
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

    # Normalize and validate slug, if provided.
    if "slug" in update_data:
        raw_slug = update_data.get("slug")
        if raw_slug is not None:
            normalized = slugify_name(str(raw_slug))
            if not normalized:
                raise HTTPException(
                    status_code=422,
                    detail={"slug": "invalid"},
                )
            # Ensure uniqueness: collect existing slugs excluding this artist
            existing = [
                s
                for (s,) in db.query(Artist.slug)
                .filter(Artist.slug.isnot(None))
                .filter(Artist.user_id != current_user.id)
                .all()
                if s
            ]
            unique_slug = generate_unique_slug(normalized, existing)
            update_data["slug"] = unique_slug
        else:
            # Allow explicitly clearing the slug
            update_data["slug"] = None

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

    # Validation: if resulting state is vat_registered==True, require vat_number
    try:
        effective_vat_registered = (
            update_data.get("vat_registered")
            if "vat_registered" in update_data
            else bool(getattr(artist_profile, "vat_registered", False))
        )
        effective_vat_number = (
            update_data.get("vat_number")
            if "vat_number" in update_data
            else getattr(artist_profile, "vat_number", None)
        )
        if effective_vat_registered and (not effective_vat_number or not str(effective_vat_number).strip()):
            raise HTTPException(status_code=422, detail={"vat_number": "required_when_vat_registered"})
    except HTTPException:
        raise
    except Exception:
        # Be conservative: do not block updates on unexpected validation errors
        pass

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
        content = await file.read()
        if MAX_PROFILE_PIC_SIZE and len(content) > MAX_PROFILE_PIC_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"Image too large. Max size is {MAX_PROFILE_PIC_SIZE} bytes.",
            )
        # Validate that the uploaded bytes are a decodable image
        try:
            if Image is None:
                raise RuntimeError("PIL not available")
            img = Image.open(BytesIO(content))
            img.verify()
        except HTTPException:
            raise
        except Exception as img_err:
            logger.info("Invalid image uploaded for profile picture by user %s: %s", current_user.id, img_err)
            raise HTTPException(status_code=400, detail="Invalid image file.")

        # Prefer R2 avatars/{user_id}/... when configured; fallback to /static/profile_pics
        stored_url: Optional[str] = None
        try:
            cfg = r2utils.R2Config()
            if cfg.is_configured():
                # Reuse the avatar key pattern for consistent storage layout
                try:
                    key = r2utils._build_avatar_key(int(current_user.id), file.filename, file.content_type or "image/jpeg")  # type: ignore[attr-defined]
                except Exception:
                    # Fallback: simple avatars/{user_id}/{uuid}.ext naming
                    import uuid
                    ext = r2utils.guess_extension(file.filename, file.content_type) or ".jpg"
                    key = f"avatars/{int(current_user.id)}/{uuid.uuid4().hex}{ext}"
                r2utils.put_bytes(key, content, content_type=file.content_type or "image/jpeg")
                stored_url = key
        except Exception as exc:
            logger.warning("R2 avatar upload failed for artist user_id=%s: %s", current_user.id, exc)
            stored_url = None

        if not stored_url:
            # Local static fallback
            import uuid

            ext = r2utils.guess_extension(file.filename, file.content_type) or ".jpg"
            name = f"{uuid.uuid4().hex}{ext}"
            fs_path = PROFILE_PICS_DIR / name
            try:
                fs_path.write_bytes(content)
            except Exception as exc:
                logger.exception("Failed to write profile picture file %s: %s", fs_path, exc)
                raise HTTPException(status_code=500, detail="Could not upload profile picture.")
            stored_url = f"/static/profile_pics/{name}"

        # Best-effort cleanup for legacy static URLs
        try:
            old = artist_profile.profile_picture_url or ""
            if isinstance(old, str) and old.startswith("/static/"):
                rel = old.replace("/static/", "", 1)
                old_file = STATIC_DIR / rel
                if old_file.exists():
                    try:
                        old_file.unlink()
                    except OSError as e:
                        logger.warning("Error deleting old profile picture %s: %s", old_file, e)
        except Exception:
            pass

        artist_profile.profile_picture_url = stored_url
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)

        return artist_profile

    except HTTPException:
        # Pass through validation errors
        raise
    except Exception:
        logger.exception("Error processing profile picture upload for user %s", current_user.id)
        raise HTTPException(status_code=500, detail="Could not upload profile picture.")

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
        content = await file.read()
        if MAX_PORTFOLIO_IMAGE_SIZE and len(content) > MAX_PORTFOLIO_IMAGE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"Image too large. Max size is {MAX_PORTFOLIO_IMAGE_SIZE} bytes.",
            )
        # Validate that the uploaded bytes are a decodable image
        try:
            if Image is None:
                raise RuntimeError("PIL not available")
            img = Image.open(BytesIO(content))
            img.verify()
        except HTTPException:
            raise
        except Exception as img_err:
            logger.info("Invalid image uploaded for cover photo by user %s: %s", current_user.id, img_err)
            raise HTTPException(status_code=400, detail="Invalid image file.")

        stored_url: Optional[str] = None
        # Prefer R2 cover_photos/{user_id}/... when configured; fallback to /static/cover_photos
        try:
            cfg = r2utils.R2Config()
            if cfg.is_configured():
                try:
                    key = r2utils._build_user_scoped_key("cover_photos", int(current_user.id), file.filename, file.content_type or "image/jpeg")  # type: ignore[attr-defined]
                except Exception:
                    import uuid
                    ext = r2utils.guess_extension(file.filename, file.content_type) or ".jpg"
                    key = f"cover_photos/{int(current_user.id)}/{uuid.uuid4().hex}{ext}"
                r2utils.put_bytes(key, content, content_type=file.content_type or "image/jpeg")
                stored_url = key
        except Exception as exc:
            logger.warning("R2 cover upload failed for artist user_id=%s: %s", current_user.id, exc)
            stored_url = None

        if not stored_url:
            import uuid

            ext = r2utils.guess_extension(file.filename, file.content_type) or ".jpg"
            name = f"{uuid.uuid4().hex}{ext}"
            fs_path = COVER_PHOTOS_DIR / name
            try:
                fs_path.write_bytes(content)
            except Exception as exc:
                logger.exception("Failed to write cover photo file %s: %s", fs_path, exc)
                raise HTTPException(status_code=500, detail="Could not upload cover photo.")
            stored_url = f"/static/cover_photos/{name}"

        # Best-effort cleanup for legacy static URLs
        try:
            old = artist_profile.cover_photo_url or ""
            if isinstance(old, str) and old.startswith("/static/"):
                rel = old.replace("/static/", "", 1)
                old_file = STATIC_DIR / rel
                if old_file.exists():
                    try:
                        old_file.unlink()
                    except OSError as e:
                        logger.warning("Error deleting old cover photo %s: %s", old_file, e)
        except Exception:
            pass

        artist_profile.cover_photo_url = stored_url
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)

        return artist_profile

    except HTTPException:
        # Pass through validation errors
        raise
    except Exception:
        logger.exception("Error processing cover photo upload for user %s", current_user.id)
        raise HTTPException(status_code=500, detail="Could not upload cover photo.")

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
            if MAX_PORTFOLIO_IMAGE_SIZE and len(content) > MAX_PORTFOLIO_IMAGE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"Image too large. Max size is {MAX_PORTFOLIO_IMAGE_SIZE} bytes.",
                )
            # Validate each image before storing
            try:
                if Image is None:
                    raise RuntimeError("PIL not available")
                img = Image.open(BytesIO(content))
                img.verify()
            except HTTPException:
                raise
            except Exception as img_err:
                logger.info("Invalid portfolio image uploaded by user %s: %s", current_user.id, img_err)
                raise HTTPException(status_code=400, detail="Invalid image file.")

            stored_url: Optional[str] = None
            # Prefer R2 portfolio_images/{user_id}/...; fallback to /static/portfolio_images
            try:
                cfg = r2utils.R2Config()
                if cfg.is_configured():
                    try:
                        key = r2utils._build_user_scoped_key("portfolio_images", int(current_user.id), up.filename, up.content_type or "image/jpeg")  # type: ignore[attr-defined]
                    except Exception:
                        import uuid
                        ext = r2utils.guess_extension(up.filename, up.content_type) or ".jpg"
                        key = f"portfolio_images/{int(current_user.id)}/{uuid.uuid4().hex}{ext}"
                    r2utils.put_bytes(key, content, content_type=up.content_type or "image/jpeg")
                    stored_url = key
            except Exception as exc:
                logger.warning("R2 portfolio upload failed for artist user_id=%s: %s", current_user.id, exc)
                stored_url = None

            if not stored_url:
                import uuid

                ext = r2utils.guess_extension(up.filename, up.content_type) or ".jpg"
                name = f"{uuid.uuid4().hex}{ext}"
                fs_path = PORTFOLIO_IMAGES_DIR / name
                try:
                    fs_path.write_bytes(content)
                except Exception as exc:
                    logger.exception("Failed to write portfolio image file %s: %s", fs_path, exc)
                    raise HTTPException(status_code=500, detail="Could not upload portfolio image.")
                stored_url = f"/static/portfolio_images/{name}"

            new_urls.append(stored_url)

        artist_profile.portfolio_image_urls = new_urls
        db.add(artist_profile)
        db.commit()
        db.refresh(artist_profile)
        return artist_profile
    except HTTPException:
        # Pass through validation errors
        raise
    except Exception:
        logger.exception("Error processing portfolio image upload for user %s", current_user.id)
        raise HTTPException(status_code=500, detail="Could not upload portfolio image.")
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
    request: Request,
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
    """Return a list of all service provider profiles with optional filters.

    Optimizations:
    - Fast path for lean field sets (id, business_name, profile_picture_url)
      with tiny avatar proxy URLs and ETag-based 304 revalidation.
    - Redis-backed caching for common parameter combinations (including fields).
    """

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
    if hasattr(fields, "default"):
        fields = None

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
    # Determine if fast path applies
    requested: Optional[set[str]] = None
    if isinstance(fields, str) and fields.strip():
        # Sanitize requested fields: drop dotted paths and unknown keys
        raw_requested = {f.strip() for f in fields.split(",") if f.strip()}
        raw_requested = {f for f in raw_requested if "." not in f}
        # Whitelist of allowed field names the list route can safely project
        allowed_fields = {
            "id",
            "user_id",
            "business_name",
            "slug",
            "profile_picture_url",
            "custom_subtitle",
            "hourly_rate",
            "price_visible",
            "rating",
            "rating_count",
            "location",
            "service_categories",
            "created_at",
            "updated_at",
        }
        requested = {f for f in raw_requested if f in allowed_fields}
    fast_fields = {"id", "business_name", "profile_picture_url"}
    fast_sort_ok = sort in (None, "most_booked", "newest")
    fast_filters_ok = (when is None) and (artist is None) and (not include_price_distribution)
    use_fast_path = requested and requested.issubset(fast_fields) and fast_sort_ok and fast_filters_ok

    # Try Redis cache first (now keyed by fields too)
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
            fields=fields,
        )
        if cached is not None:
            # Defensive scrub: legacy cached payloads may have null timestamps
            try:
                from datetime import datetime as _dt
                items = cached.get("data") if isinstance(cached, dict) else None
                if isinstance(items, list):
                    for it in items:
                        if isinstance(it, dict):
                            # Ensure user_id is present for response validation; derive from id if needed
                            if it.get("user_id") is None and isinstance(it.get("id"), int):
                                it["user_id"] = int(it["id"])  # id mirrors user_id in schema
                            ca = it.get("created_at")
                            ua = it.get("updated_at")
                            if not ca and ua:
                                it["created_at"] = ua
                            if not ua and ca:
                                it["updated_at"] = ca
                            if not it.get("created_at"):
                                it["created_at"] = _dt.utcnow()
                            if not it.get("updated_at"):
                                it["updated_at"] = it.get("created_at")
            except Exception:
                pass
            try:
                etag = 'W/"' + hashlib.sha256(json.dumps(cached, separators=(",", ":"), sort_keys=True).encode("utf-8")).hexdigest() + '"'
            except Exception:
                etag = None
            response.headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=300"
            if etag:
                if request.headers.get("if-none-match") == etag:
                    response.headers["ETag"] = etag
                    response.headers["X-Cache"] = "REVALIDATED"
                    return Response(status_code=304)
                response.headers["ETag"] = etag
            response.headers["X-Cache"] = "HIT"
            return cached

    # FAST PATH: only id, business_name, profile_picture_url
    if use_fast_path:
        booking_subq = (
            db.query(
                Booking.artist_id.label("artist_id"),
                func.count(Booking.id).label("book_count"),
            )
            .group_by(Booking.artist_id)
            .subquery()
        )

        cols = [
            Artist.user_id.label("user_id"),
            Artist.business_name,
            Artist.slug,
            Artist.profile_picture_url,
            Artist.created_at.label("created_at"),
            Artist.updated_at.label("updated_at"),
            booking_subq.c.book_count,
        ]
        query = db.query(*cols).outerjoin(booking_subq, booking_subq.c.artist_id == Artist.user_id)
        query = query.filter(Artist.services.any(Service.status == "approved"))
        if category_slug:
            query = (
                query.join(Service, Service.artist_id == Artist.user_id)
                .join(ServiceCategory, Service.service_category_id == ServiceCategory.id)
                .filter(getattr(Service, "status", "approved") == "approved")
                .filter(func.lower(ServiceCategory.name) == category_slug.replace("_", " "))
            )
            # Avoid duplicates when an artist has multiple matching services
            query = query.group_by(
                Artist.user_id,
                Artist.business_name,
                Artist.slug,
                Artist.profile_picture_url,
                Artist.created_at,
                Artist.updated_at,
                booking_subq.c.book_count,
            )
        if location:
            query = query.filter(Artist.location.ilike(f"%{location}%"))
        if sort == "most_booked":
            # SQLite doesn't support NULLS LAST; use COALESCE so NULLs sort as 0
            query = query.order_by(desc(func.coalesce(booking_subq.c.book_count, 0)))
        else:
            query = query.order_by(Artist.updated_at.desc())

        total_q = db.query(func.count(Artist.user_id))
        total_q = total_q.filter(Artist.services.any(Service.status == "approved"))
        if category_slug:
            total_q = (
                total_q.join(Service, Service.artist_id == Artist.user_id)
                .join(ServiceCategory, Service.service_category_id == ServiceCategory.id)
                .filter(getattr(Service, "status", "approved") == "approved")
                .filter(func.lower(ServiceCategory.name) == category_slug.replace("_", " "))
            )
        if location:
            total_q = total_q.filter(Artist.location.ilike(f"%{location}%"))
        total = int(total_q.scalar() or 0)

        rows = query.offset((page - 1) * limit).limit(limit).all()

        def tiny_avatar_url(_id: int, src: Optional[str], v) -> Optional[str]:
            """Return a public absolute URL suitable for Next.js image optimizer.

            Option A: Prefer direct Cloudflare R2 public URLs when available.
            - If `src` is already an absolute URL (http/https), return as-is.
            - If `src` looks like an object key or relative path, join with
              R2_PUBLIC_BASE_URL so the frontend can load it directly.
            - If missing, return None so the UI can show a default/fallback.
            """
            if not src:
                return None
            s = str(src).strip()
            if not s:
                return None
            # Absolute URL already — trust it
            if s.lower().startswith("http://") or s.lower().startswith("https://"):
                return s
            # Otherwise, build from public base
            try:
                from app.core.config import settings  # lazy import to avoid cycles
                base = (getattr(settings, 'R2_PUBLIC_BASE_URL', '') or '').strip().rstrip('/')
            except Exception:
                base = ''
            if not base:
                # As a last resort, return None so frontend falls back to default avatar
                return None
            # Normalize to '{base}/{object_key_or_relative_path}'
            rel = s.lstrip('/')
            return f"{base}/{rel}"

        data = []
        from datetime import datetime as _dt
        for _user_id, name, slug, avatar, created_at, updated_at, _book_count in rows:
            # Coalesce legacy null timestamps to satisfy response model
            ca = created_at or updated_at or _dt.utcnow()
            ua = updated_at or created_at or ca
            item: dict[str, Any] = {
                "user_id": int(_user_id),
                "created_at": ca,
                "updated_at": ua,
            }
            if (not requested) or ("slug" in requested):
                item["slug"] = slug
            # Optional, include if requested or for completeness
            if (not requested) or ("business_name" in requested):
                item["business_name"] = name
            if (not requested) or ("profile_picture_url" in requested):
                item["profile_picture_url"] = tiny_avatar_url(int(_user_id), avatar, updated_at)
            data.append(item)

        payload = {"data": data, "total": total, "price_distribution": []}
        payload_for_etag = jsonable_encoder(payload)
        # Cache the fast-path payload so repeated requests HIT Redis
        try:
            cache_artist_list(
                payload,
                page=page,
                limit=limit,
                category=cache_category,
                location=location,
                sort=sort,
                min_price=min_price,
                max_price=max_price,
                expire=60,
                fields=fields,
            )
        except Exception:
            pass
        try:
            serialized = json.dumps(payload_for_etag, separators=(",", ":"), sort_keys=True).encode("utf-8")
            etag = 'W/"' + hashlib.sha256(serialized).hexdigest() + '"'
        except Exception:
            etag = None
        response.headers["Cache-Control"] = "public, s-maxage=300, stale-while-revalidate=1800"
        if etag:
            if request.headers.get("if-none-match") == etag:
                response.headers["ETag"] = etag
                response.headers["X-Cache"] = "REVALIDATED"
                return Response(status_code=304)
            response.headers["ETag"] = etag
        response.headers["X-Cache"] = "MISS"
        return payload

    # SLOWER PATH (original logic, slightly trimmed)
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
    # Cross-DB compatible aggregation of category names
    dialect = getattr(db.get_bind(), "dialect", None)
    dname = getattr(dialect, "name", "sqlite") if dialect else "sqlite"
    if dname == "postgresql":
        categories_agg = func.string_agg(ServiceCategory.name, ",")
    else:
        categories_agg = func.group_concat(ServiceCategory.name, ",")

    category_subq = (
        db.query(
            Service.artist_id.label("artist_id"),
            categories_agg.label("service_categories"),
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
        # Only load user if needed by downstream serialization
        # .options(joinedload(Artist.user))
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
            service_price_col,
        )

    if location:
        query = query.filter(Artist.location.ilike(f"%{location}%"))

    if sort == "top_rated":
        query = query.order_by(desc(rating_subq.c.rating))
    elif sort == "most_booked":
        query = query.order_by(desc(booking_subq.c.book_count))
    elif sort == "newest":
        query = query.order_by(desc(Artist.created_at))

    # Count total BEFORE pagination
    total_count = query.count()

    price_distribution_data: List[Dict[str, Any]] = []
    if include_price_distribution:
        # Compute distribution from a focused aggregation to avoid materializing full rows
        try:
            bucket_counts: Dict[Tuple[int, int], int] = defaultdict(int)
            if category_slug or min_price is not None or max_price is not None:
                # Use the price_subq (min price per artist, with optional category filter)
                prices = db.query(func.min(Service.price)).join(ServiceCategory, Service.service_category_id == ServiceCategory.id, isouter=True)
                prices = prices.filter(getattr(Service, "status", "approved") == "approved")
                if category_slug:
                    prices = prices.filter(func.lower(ServiceCategory.name) == category_slug.replace("_", " "))
                prices = prices.group_by(Service.artist_id)
                all_min_prices = [float(p or 0) for p, in prices.all()]
            else:
                # All artists: same approach as the lean endpoint
                all_min_prices = [
                    float(p or 0)
                    for p, in db.query(func.min(Service.price))
                    .filter(getattr(Service, "status", "approved") == "approved")
                    .group_by(Service.artist_id)
                    .all()
                ]
            for price in all_min_prices:
                for b_min, b_max in PRICE_BUCKETS:
                    if b_min <= price <= b_max:
                        bucket_counts[(b_min, b_max)] += 1
                        break
            for b_min, b_max in PRICE_BUCKETS:
                price_distribution_data.append({
                    "min": b_min,
                    "max": b_max,
                    "count": bucket_counts.get((b_min, b_max), 0),
                })
        except Exception:
            price_distribution_data = []

    offset = (page - 1) * limit
    artists = query.offset(offset).limit(limit).all()

    # Helper to scrub heavy inline images from list payloads
    def _scrub_image(val: Optional[str]) -> Optional[str]:
        try:
            if isinstance(val, str) and val.startswith("data:") and len(val) > 1000:
                return None
        except Exception:
            pass
        return val

    requested = requested  # reuse from above

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
        # Ensure user_id is present explicitly for response validation
        try:
            base["user_id"] = int(getattr(artist, "user_id"))
        except Exception:
            pass
        # Coalesce legacy null timestamps for response validation
        try:
            from datetime import datetime as _dt
            if not base.get("created_at"):
                base["created_at"] = base.get("updated_at") or _dt.utcnow()
            if not base.get("updated_at"):
                base["updated_at"] = base.get("created_at")
        except Exception:
            pass
        # Preserve profile_picture_url even if it's a data URL so list views
        # (e.g., homepage carousels) can show the cropped avatar without
        # depending on static storage. Covers/portfolios are excluded below.
        # base["profile_picture_url"] remains as stored.
        # Exclude heavy fields by default; clients can request explicitly via `fields`
        base["portfolio_image_urls"] = None
        base["cover_photo_url"] = None
        if requested is not None:
            always_keep = {"user_id", "created_at", "updated_at"}
            # If nothing allowable was requested, keep the default base (avoid empty payload causing model errors)
            if requested:
                base = {k: v for k, v in base.items() if (k in requested) or (k in always_keep)}
        try:
            profile = ArtistProfileResponse.model_validate(base)
        except Exception:
            # Fallback to an untrimmed model on validation issues to avoid 500s
            profile = ArtistProfileResponse.model_validate({**base})
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
        try:
            # Include user_id explicitly so cached payloads validate on response_model
            payload_for_cache = {
                "data": [
                    ({**p.model_dump(), "user_id": int(getattr(p, "user_id", 0) or 0)} if hasattr(p, "user_id") else p.model_dump())
                    for p in profiles
                ],
                "total": total_count,
                "price_distribution": price_distribution_data,
            }
        except Exception:
            payload_for_cache = {
                "data": [],
                "total": total_count,
                "price_distribution": price_distribution_data,
            }
        cache_artist_list(
            payload_for_cache,
            page=page,
            limit=limit,
            category=cache_category,
            location=location,
            sort=sort,
            min_price=min_price,
            max_price=max_price,
            expire=60,
            fields=fields,
        )

    # Prefer direct, cacheable public URLs for avatars (Option A)
    # - If the stored value is an absolute URL (e.g., Cloudflare R2), keep as-is.
    # - If it's a relative storage path (e.g., profile_pics/...), expose it via /static so Next/Image can optimize.
    # - If it's a data: URL, keep it (UI will mark as unoptimized), or callers may trim via fields.
    # This replaces the previous proxy rewrite to /api/v1/img/avatar/... and is easy to revert if needed.
    try:
        from urllib.parse import urlparse
        from app.core.config import settings as _settings  # lazy import

        r2_base = (getattr(_settings, 'R2_PUBLIC_BASE_URL', '') or '').strip().rstrip('/')

        def _public_avatar_url(src: Optional[str]) -> Optional[str]:
            if not src:
                return None
            s = str(src).strip()
            if not s:
                return None
            lower = s.lower()
            # Absolute URL already (R2/public/CDN/etc.)
            if lower.startswith('http://') or lower.startswith('https://'):
                return s
            # Data/blob previews: keep as-is so UI can display without a round-trip
            if lower.startswith('data:') or lower.startswith('blob:'):
                return s
            # If it looks like an object key (no scheme/host), prefer R2 public base when configured
            if r2_base and not s.startswith('/') and not s.startswith('static/'):
                return f"{r2_base}/{s}"
            # Otherwise normalize to /static mounts so Next can fetch via backend
            # Allow existing /api/ image proxies to pass through unchanged
            if s.startswith('/api/'):
                return s
            # Strip leading slashes and coerce known mounts under /static
            rel = s.lstrip('/')
            if rel.startswith(('profile_pics/', 'cover_photos/', 'portfolio_images/', 'attachments/', 'media/')):
                return f"/static/{rel}"
            # If already under /static, keep it
            if s.startswith('/static/'):
                return s
            # Fallback: expose as /static/<path>
            return f"/static/{rel}"

        for p in profiles:
            p.profile_picture_url = _public_avatar_url(p.profile_picture_url)
    except Exception:
        pass

    # Set caching headers on the response
    if cacheable:
        try:
            payload = jsonable_encoder([p.model_dump() for p in profiles])
            etag = 'W/"' + hashlib.sha256(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")).hexdigest() + '"'
        except Exception:
            etag = None
        response.headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=300"
        if etag:
            if request.headers.get("if-none-match") == etag:
                response.headers["ETag"] = etag
                response.headers["X-Cache"] = "REVALIDATED"
                return Response(status_code=304)
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


class AvatarPresignIn(BaseModel):
    filename: Optional[str] = None
    content_type: Optional[str] = None


@router.post(
    "/me/avatar/presign",
    response_model=PresignOut,
    summary="Presign an R2 PUT for the current user's avatar",
)
def presign_avatar_me(
    payload: AvatarPresignIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a short-lived PUT URL and public URL for uploading an avatar directly to R2.

    Store the returned ``key`` (preferred) or the ``public_url`` on your profile via
    PUT /api/v1/service-provider-profiles/me { profile_picture_url: key }.
    """
    # Ensure artist profile exists (align with other /me routes)
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist_profile:
        raise HTTPException(status_code=404, detail="Artist profile not found.")
    try:
        info = r2utils.presign_put_avatar(current_user.id, payload.filename, payload.content_type)
    except Exception as exc:
        logger.exception("Failed to presign avatar upload: %s", exc)
        raise HTTPException(status_code=500, detail="Avatar presign failed.")
    # Map to PresignOut schema
    return PresignOut(
        key=info.get("key") or "",
        put_url=info.get("put_url") or None,
        get_url=info.get("get_url") or None,
        public_url=info.get("public_url") or None,
        headers=info.get("headers") or {},
        upload_expires_in=int(info.get("upload_expires_in") or 0),
        download_expires_in=int(info.get("download_expires_in") or 0),
    )


@router.post(
    "/me/cover-photo/presign",
    response_model=PresignOut,
    summary="Presign an R2 PUT for the current user's cover photo",
)
def presign_cover_me(
    payload: AvatarPresignIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist_profile:
        raise HTTPException(status_code=404, detail="Artist profile not found.")
    try:
        info = r2utils.presign_put_cover(current_user.id, payload.filename, payload.content_type)
    except Exception as exc:
        logger.exception("Failed to presign cover upload: %s", exc)
        raise HTTPException(status_code=500, detail="Cover presign failed.")
    return PresignOut(
        key=info.get("key") or "",
        put_url=info.get("put_url") or None,
        get_url=info.get("get_url") or None,
        public_url=info.get("public_url") or None,
        headers=info.get("headers") or {},
        upload_expires_in=int(info.get("upload_expires_in") or 0),
        download_expires_in=int(info.get("download_expires_in") or 0),
    )


@router.post(
    "/me/portfolio-images/presign",
    response_model=PresignOut,
    summary="Presign an R2 PUT for a portfolio image",
)
def presign_portfolio_image_me(
    payload: AvatarPresignIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    artist_profile = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist_profile:
        raise HTTPException(status_code=404, detail="Artist profile not found.")
    try:
        info = r2utils.presign_put_portfolio(current_user.id, payload.filename, payload.content_type)
    except Exception as exc:
        logger.exception("Failed to presign portfolio upload: %s", exc)
        raise HTTPException(status_code=500, detail="Portfolio presign failed.")
    return PresignOut(
        key=info.get("key") or "",
        put_url=info.get("put_url") or None,
        get_url=info.get("get_url") or None,
        public_url=info.get("public_url") or None,
        headers=info.get("headers") or {},
        upload_expires_in=int(info.get("upload_expires_in") or 0),
        download_expires_in=int(info.get("download_expires_in") or 0),
    )


@router.get(
    "/{artist_id}",
    response_model=ArtistProfileResponse,
    response_model_exclude_none=True,
)
def read_artist_profile_by_id(artist_id: int, db: Session = Depends(get_db)):
    artist = db.query(Artist).filter(Artist.user_id == artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist profile not found.")
    # Defensive: ensure timestamps present for response validation
    try:
        from datetime import datetime as _dt
        if not getattr(artist, "created_at", None):
            artist.created_at = getattr(artist, "updated_at", None) or _dt.utcnow()
        if not getattr(artist, "updated_at", None):
            artist.updated_at = artist.created_at
        db.add(artist)
        db.commit()
        db.refresh(artist)
    except Exception:
        pass

    # Completed / cancelled events counts for this provider
    try:
        completed_count = (
            db.query(Booking)
            .filter(
                Booking.artist_id == int(artist_id),
                Booking.status == BookingStatus.COMPLETED,
            )
            .count()
        )
        cancelled_count = (
            db.query(Booking)
            .filter(
                Booking.artist_id == int(artist_id),
                Booking.status == BookingStatus.CANCELLED,
            )
            .count()
        )
        setattr(artist, "completed_events", int(completed_count))
        setattr(artist, "cancelled_events", int(cancelled_count))
    except Exception:
        setattr(artist, "completed_events", 0)
        setattr(artist, "cancelled_events", 0)

    # Aggregate rating + review count for this provider so the client-side
    # provider profile panel can show an accurate "reviews" badge that matches
    # the reviews list.
    try:
        rating_row = (
            db.query(func.avg(Review.rating), func.count(Review.id))
            .filter(Review.artist_id == int(artist_id))
            .first()
        )
        if rating_row is not None:
            avg_rating, rating_count = rating_row
            setattr(
                artist,
                "rating",
                float(avg_rating) if avg_rating is not None else None,
            )
            setattr(
                artist,
                "rating_count",
                int(rating_count or 0),
            )
    except Exception:
        # Leave default rating / rating_count on error
        pass

    return artist


@router.get(
    "/by-slug/{slug}",
    response_model=ArtistProfileResponse,
    response_model_exclude_none=True,
    summary="Get artist profile by slug",
)
def read_artist_profile_by_slug(slug: str, db: Session = Depends(get_db)):
    cleaned = slugify_name(slug)
    if not cleaned:
        raise HTTPException(status_code=404, detail="Artist profile not found.")

    artist = db.query(Artist).filter(func.lower(Artist.slug) == cleaned).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist profile not found.")

    # Defensive timestamp normalization mirroring read_artist_profile_by_id
    try:
        from datetime import datetime as _dt
        if not getattr(artist, "created_at", None):
            artist.created_at = getattr(artist, "updated_at", None) or _dt.utcnow()
        if not getattr(artist, "updated_at", None):
            artist.updated_at = artist.created_at
        db.add(artist)
        db.commit()
        db.refresh(artist)
    except Exception:
        pass

    # Completed / cancelled events counts for this provider
    try:
        completed_count = (
            db.query(Booking)
            .filter(
                Booking.artist_id == int(artist.user_id),
                Booking.status == BookingStatus.COMPLETED,
            )
            .count()
        )
        cancelled_count = (
            db.query(Booking)
            .filter(
                Booking.artist_id == int(artist.user_id),
                Booking.status == BookingStatus.CANCELLED,
            )
            .count()
        )
        setattr(artist, "completed_events", int(completed_count))
        setattr(artist, "cancelled_events", int(cancelled_count))
    except Exception:
        setattr(artist, "completed_events", 0)
        setattr(artist, "cancelled_events", 0)

    # Aggregate rating + review count for this provider
    try:
        rating_row = (
            db.query(func.avg(Review.rating), func.count(Review.id))
            .filter(Review.artist_id == int(artist.user_id))
            .first()
        )
        if rating_row is not None:
            avg_rating, rating_count = rating_row
            setattr(
                artist,
                "rating",
                float(avg_rating) if avg_rating is not None else None,
            )
            setattr(
                artist,
                "rating_count",
                int(rating_count or 0),
            )
    except Exception:
        pass

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


# (Removed duplicate "/" list route to avoid undefined behavior and cache fragmentation)
