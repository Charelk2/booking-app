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
    """Best-effort filter derivation using Google Generative AI when configured.

    This function is intentionally defensive:
    - If GOOGLE_GENAI_API_KEY is not set, it returns the baseline filters.
    - If the model call fails or returns unexpected output, it falls back to
      the baseline filters.
    - Existing filters from the UI (base) take precedence over AI guesses.
    """
    api_key = (getattr(settings, "GOOGLE_GENAI_API_KEY", "") or "").strip()
    model_name = (getattr(settings, "GOOGLE_GENAI_MODEL", "") or "").strip() or "gemini-2.5-flash"
    if not api_key or not model_name:
        return base

    try:
        from google import genai  # type: ignore
    except Exception:
        # Library not installed or import failed; avoid breaking search.
        logger.warning("google-genai not available; falling back to baseline filters")
        return base

    # Prepare a compact JSON snippet of the existing filters to give the model context.
    base_payload = {
        "category": base.category,
        "location": base.location,
        "when": base.when.isoformat() if base.when else None,
        "min_price": base.min_price,
        "max_price": base.max_price,
    }

    system_instructions = (
        "You help interpret event search queries for a South African booking site (Booka). "
        "Given a user query and existing filters, you output ONLY a compact JSON object with "
        "the fields: category, location, when, min_price, max_price. "
        "Use null for any field you cannot infer. "
        "Do not include any prose or explanation outside of the JSON."
    )

    prompt = (
        f"{system_instructions}\n\n"
        f"Existing filters (JSON): {json.dumps(base_payload, ensure_ascii=False)}\n"
        f"User query: {query.strip()}\n\n"
        "Respond with JSON only, like:\n"
        '{"category": "dj", "location": "Cape Town", "when": "2026-10-14", "min_price": null, "max_price": 8000}\n'
    )

    try:
        client = genai.Client(api_key=api_key)
        res = client.models.generate_content(model=model_name, contents=prompt)
        text = (getattr(res, "text", None) or "").strip()
        if not text:
            logger.debug("GenAI returned empty text; falling back to baseline filters")
            return base

        # Attempt to isolate JSON from any surrounding text or fences.
        # Prefer the substring between the first '{' and last '}'.
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            json_str = text[start : end + 1]
        else:
            json_str = text

        data = json.loads(json_str)
        if not isinstance(data, dict):
            logger.debug("GenAI response is not a JSON object; falling back to baseline filters")
            return base
    except Exception as exc:
        logger.warning("GenAI filter derivation failed: %s", exc)
        return base

    # Merge AI-derived filters with the baseline, giving precedence to baseline
    # (UI) values when present.
    category = base.category or (data.get("category") or None)
    if isinstance(category, str):
        category = category.strip() or None

    location = base.location or (data.get("location") or None)
    if isinstance(location, str):
        location = location.strip() or None

    when_val = base.when
    if when_val is None:
        raw_when = data.get("when")
        if isinstance(raw_when, str):
            try:
                when_val = date.fromisoformat(raw_when)
            except Exception:
                when_val = None

    def _num(v: Any) -> Optional[float]:
        try:
            if v is None:
                return None
            return float(v)
        except Exception:
            return None

    min_price = base.min_price
    if min_price is None:
        min_price = _num(data.get("min_price"))

    max_price = base.max_price
    if max_price is None:
        max_price = _num(data.get("max_price"))

    # Clamp price bounds as before.
    if min_price is not None:
        min_price = max(0.0, min(min_price, 1_000_000.0))
    if max_price is not None:
        max_price = max(0.0, min(max_price, 1_000_000.0))

    merged = AiSearchFilters(
        category=category,
        location=location,
        when=when_val,
        min_price=min_price,
        max_price=max_price,
    )
    try:
        logger.debug("AI-derived filters: %s", merged)
    except Exception:
        pass
    return merged


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
    # names for display, not histogram data. Use string_agg on Postgres and
    # group_concat on SQLite/others.
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
