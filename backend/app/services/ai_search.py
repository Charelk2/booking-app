import json
import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings, FRONTEND_PRIMARY
from app.models.service_provider_profile import ServiceProviderProfile as Artist
from app.models.service import Service
from app.models.service_category import ServiceCategory
from app.models.review import Review

logger = logging.getLogger(__name__)


@dataclass
class AiSearchFilters:
    category: Optional[str] = None
    location: Optional[str] = None
    when: Optional[date] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None


def _coerce_filters_from_payload(payload: Dict[str, Any]) -> Tuple[AiSearchFilters, int]:
    """Coerce a JSON payload into AiSearchFilters and a sane limit."""
    limit_raw = payload.get("limit")
    try:
        limit = int(limit_raw) if limit_raw is not None else 6
    except Exception:
        limit = 6
    limit = max(1, min(limit, 12))

    category = payload.get("category") or None
    if isinstance(category, str):
        category = category.strip() or None
    location = payload.get("location") or None
    if isinstance(location, str):
        location = location.strip() or None

    when_val = payload.get("when") or None
    when: Optional[date] = None
    if isinstance(when_val, str):
        try:
            when = date.fromisoformat(when_val)
        except Exception:
            when = None

    def _num(v: Any) -> Optional[float]:
        try:
            if v is None:
                return None
            return float(v)
        except Exception:
            return None

    min_price = _num(payload.get("min_price"))
    max_price = _num(payload.get("max_price"))

    # Clamp price bounds to a reasonable range in ZAR.
    if min_price is not None:
        min_price = max(0.0, min(min_price, 1_000_000.0))
    if max_price is not None:
        max_price = max(0.0, min(max_price, 1_000_000.0))

    filters = AiSearchFilters(
        category=category,
        location=location,
        when=when,
        min_price=min_price,
        max_price=max_price,
    )
    return filters, limit


def _ai_derive_filters(query: str, base: AiSearchFilters) -> AiSearchFilters:
    """Best-effort filter derivation.

    For now this uses a simple heuristic and existing context. When
    OPENAI_API_KEY is configured, this can be upgraded to call OpenAI with a
    structured prompt to infer category/location/budget more accurately.
    """
    # If AI is disabled or no key, return the baseline filters unchanged.
    api_key = (getattr(settings, "OPENAI_API_KEY", "") or "").strip()
    if not api_key:
        return base

    # TODO: Integrate with OpenAI Chat Completions using OPENAI_MODEL.
    # For now, keep behavior simple and predictable to avoid surprises in
    # environments where outbound network may be restricted.
    try:
        logger.debug("AI search placeholder active; using baseline filters only.")
    except Exception:
        pass
    return base


def _search_providers_with_filters(db: Session, filters: AiSearchFilters, limit: int) -> List[Dict[str, Any]]:
    """Execute a lightweight provider search using the given filters.

    This reuses a subset of the logic from read_all_service_provider_profiles
    to keep results consistent with the main listing page.
    """
    # Aggregate rating info per artist
    rating_subq = (
        db.query(
            Review.artist_id.label("artist_id"),
            func.avg(Review.rating).label("rating"),
            func.count(Review.id).label("rating_count"),
        )
        .group_by(Review.artist_id)
        .subquery()
    )

    # Cross-DB category aggregation is overkill here; we only need category
    # names for display, not histogram data.
    categories_agg = func.group_concat(ServiceCategory.name, ",")

    category_subq = (
        db.query(
            Service.artist_id.label("artist_id"),
            categories_agg.label("service_categories"),
            func.min(Service.price).label("service_min_price"),
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
            category_subq.c.service_categories,
            category_subq.c.service_min_price,
        )
        .outerjoin(rating_subq, rating_subq.c.artist_id == Artist.user_id)
        .outerjoin(category_subq, category_subq.c.artist_id == Artist.user_id)
    )

    # Only include providers with at least one approved service.
    query = query.filter(Artist.services.any(Service.status == "approved"))

    if filters.category:
        category_slug = filters.category.lower().replace(" ", "_")
        query = (
            query.join(Service, Service.artist_id == Artist.user_id)
            .join(ServiceCategory, Service.service_category_id == ServiceCategory.id)
            .filter(getattr(Service, "status", "approved") == "approved")
            .filter(func.lower(ServiceCategory.name) == category_slug.replace("_", " "))
        )
        query = query.group_by(
            Artist.user_id,
            Artist.business_name,
            Artist.location,
            Artist.profile_picture_url,
            Artist.created_at,
            Artist.updated_at,
            rating_subq.c.rating,
            rating_subq.c.rating_count,
            category_subq.c.service_categories,
            category_subq.c.service_min_price,
        )

    if filters.location:
        query = query.filter(Artist.location.ilike(f"%{filters.location}%"))

    if filters.min_price is not None or filters.max_price is not None:
        # Filter on the min price per artist when available.
        if filters.min_price is not None:
            query = query.filter(category_subq.c.service_min_price >= filters.min_price)
        if filters.max_price is not None:
            query = query.filter(category_subq.c.service_min_price <= filters.max_price)

    # Simple ordering: favor recently updated artists with higher ratings.
    query = query.order_by(
        func.coalesce(rating_subq.c.rating, 0.0).desc(),
        Artist.updated_at.desc(),
    )

    rows = query.limit(limit).all()

    providers: List[Dict[str, Any]] = []
    frontend_base = FRONTEND_PRIMARY.rstrip("/")

    for artist, rating, rating_count, service_categories, service_min_price in rows:
        slug = getattr(artist, "slug", None) or str(getattr(artist, "user_id", ""))
        name = (
            getattr(artist, "business_name", None)
            or (
                f"{getattr(artist.user, 'first_name', '')} {getattr(artist.user, 'last_name', '')}".strip()
                if getattr(artist, "user", None)
                else ""
            )
            or "Service Provider"
        )
        location = getattr(artist, "location", None) or ""
        categories: List[str] = []
        if service_categories:
            try:
                categories = [c.strip() for c in str(service_categories).split(",") if c.strip()]
            except Exception:
                categories = []

        avatar = getattr(artist, "profile_picture_url", None) or None
        avatar_url: Optional[str] = None
        if avatar:
            # Prefer public URLs when available; otherwise use as-is.
            try:
                avatar_url = str(avatar)
            except Exception:
                avatar_url = None

        providers.append(
            {
                "slug": slug,
                "name": name,
                "location": location,
                "categories": categories,
                "rating": float(rating) if rating is not None else None,
                "review_count": int(rating_count or 0) if rating_count is not None else None,
                "starting_price": float(service_min_price) if service_min_price is not None else None,
                "profile_url": f"{frontend_base}/{slug}",
                "avatar_url": avatar_url,
                "relevance_score": None,
            }
        )

    return providers


def ai_provider_search(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for AI-assisted provider search.

    This helper is designed to be called from the API layer. It performs three
    steps:
    1. Coerce the incoming payload into baseline filters + limit.
    2. Optionally augment those filters using an LLM (when configured).
    3. Run a focused provider search and format results for the frontend.
    """
    if not getattr(settings, "FEATURE_AI_SEARCH", False):
        # Caller should translate this into 503 / ai_search_disabled.
        raise RuntimeError("ai_search_disabled")

    query_text = (payload.get("query") or "").strip()
    if not query_text:
        raise ValueError("query_required")

    base_filters, limit = _coerce_filters_from_payload(payload)
    effective_filters = _ai_derive_filters(query_text, base_filters)

    providers = _search_providers_with_filters(db, effective_filters, limit)

    # Serialize filters back to JSON-friendly values for the response.
    filters_out: Dict[str, Any] = {
        "category": effective_filters.category,
        "location": effective_filters.location,
        "when": effective_filters.when.isoformat() if effective_filters.when else None,
        "min_price": effective_filters.min_price,
        "max_price": effective_filters.max_price,
    }

    explanation = (
        "I used your query and filters to suggest matching service providers in your area."
    )
    return {
        "providers": providers,
        "filters": filters_out,
        "explanation": explanation,
        "source": "ai_v1",
    }

