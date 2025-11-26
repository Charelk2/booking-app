import json
import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import func, or_
import re

from app.core.config import settings, FRONTEND_PRIMARY
from app.models.service_provider_profile import ServiceProviderProfile as Artist
from app.models.service import Service
from app.models.service_category import ServiceCategory
from app.models.review import Review
from app.models.booking import Booking
from app.models.profile_view import ArtistProfileView
from app.models.user import User
from app.utils.json import dumps_bytes as orjson_dumps
from app.services.quote_totals import compute_quote_totals_snapshot

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


def _extract_date_from_query(query_lower: str) -> Optional[date]:
    """Best-effort date extraction from free text.

    Handles patterns like "14 October 2026" and "14/10/2026". Returns None on failure.
    """
    if not query_lower:
        return None

    # 1) "14 october 2026" style
    month_map = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "sept": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }
    m = re.search(
        r"\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
        r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b",
        query_lower,
    )
    if m:
        try:
            day = int(m.group(1))
            month_name = m.group(2)
            year = int(m.group(3))
            month = month_map.get(month_name, None)
            if month:
                return date(year, month, day)
        except Exception:
            return None

    # 2) "14/10/2026" or "14-10-2026" style (DD/MM/YYYY)
    m2 = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b", query_lower)
    if m2:
        try:
            day = int(m2.group(1))
            month = int(m2.group(2))
            year = int(m2.group(3))
            if year < 100:
                year += 2000
            return date(year, month, day)
        except Exception:
            return None

    return None


def _parse_amount(token: str) -> Optional[float]:
    """Parse amounts like 'r5000', '8k', '5.5k' into a float value in ZAR."""
    if not token:
        return None
    s = token.lower()
    s = s.replace("zar", "").replace(" ", "")
    if s.startswith("r"):
        s = s[1:]

    multiplier = 1.0
    if s.endswith("k"):
        multiplier = 1000.0
        s = s[:-1]

    # Strip any remaining non-numeric chars except dot/comma
    s = re.sub(r"[^0-9.,]", "", s)
    if not s:
        return None
    s = s.replace(",", ".")
    try:
        return float(s) * multiplier
    except Exception:
        return None


def _extract_budget_from_query(query_lower: str) -> Tuple[Optional[float], Optional[float]]:
    """Best-effort min/max price extraction from budget phrases.

    Focuses on R / ZAR / 'k' amounts with words like under, over, between, etc.
    Avoids treating bare dates or years as prices.
    """
    if not query_lower:
        return None, None

    # Normalise spacing a bit for regexes
    text = re.sub(r"\s+", " ", query_lower)

    # between X and Y / from X to Y
    m_between = re.search(
        r"\b(between|from)\s+(r?\s*\d+(?:[.,]\d+)?k?)\s+(?:and|to|-)\s+(r?\s*\d+(?:[.,]\d+)?k?)",
        text,
    )
    if m_between:
        a1 = _parse_amount(m_between.group(2))
        a2 = _parse_amount(m_between.group(3))
        if a1 is not None and a2 is not None:
            lo, hi = sorted((a1, a2))
            return lo, hi

    # under / less than / up to / max X
    m_max = re.search(
        r"\b(under|less than|below|up to|maximum|max)\s+(r?\s*\d+(?:[.,]\d+)?k?)",
        text,
    )
    if m_max:
        max_val = _parse_amount(m_max.group(2))
        return None, max_val

    # over / more than / at least / min X
    m_min = re.search(
        r"\b(over|more than|at least|minimum|min)\s+(r?\s*\d+(?:[.,]\d+)?k?)",
        text,
    )
    if m_min:
        min_val = _parse_amount(m_min.group(2))
        return min_val, None

    # "budget 5000" or "budget of 8000"
    m_budget = re.search(
        r"\bbudget(?: of)?\s+(r?\s*\d+(?:[.,]\d+)?k?)",
        text,
    )
    if m_budget:
        max_val = _parse_amount(m_budget.group(1))
        return None, max_val

    return None, None


def _extract_location_from_query(query_lower: str) -> Optional[str]:
    """Very small location extractor for major South African towns/cities."""
    if not query_lower:
        return None

    locations = {
        "cape town": "Cape Town",
        "pretoria": "Pretoria",
        "johannesburg": "Johannesburg",
        "joburg": "Johannesburg",
        "durban": "Durban",
        "gqeberha": "Gqeberha",
        "port elizabeth": "Port Elizabeth",
        "bloemfontein": "Bloemfontein",
        "bloem": "Bloemfontein",
        "stellenbosch": "Stellenbosch",
        "mossel bay": "Mossel Bay",
        "kroonstad": "Kroonstad",
        "george": "George",
        "east london": "East London",
    }

    for needle, label in locations.items():
        if needle in query_lower:
            return label

    return None


def _ai_derive_filters(query: str, base: AiSearchFilters) -> AiSearchFilters:
    """Best-effort filter derivation using lightweight heuristics and optionally Gemini/Gemma.

    This function is intentionally defensive:
    - Always applies simple local rules first (e.g., map keywords like "dj"
      or "musician" to known categories).
    - If GOOGLE_GENAI_API_KEY is not set, it returns the heuristic filters.
    - If the model call fails or returns unexpected output, it falls back to
      the heuristic filters.
    - Existing filters from the UI (base) take precedence over AI guesses.
    """
    # ── 1) Heuristic enrichment from the raw query ───────────────────────────
    query_lower = (query or "").strip().lower()

    # Start from the baseline filters coming from the UI.
    cat = base.category
    loc = base.location
    when_val = base.when
    min_price = base.min_price
    max_price = base.max_price

    if query_lower:
        # Category keyword map (slugs -> indicative keywords)
        category_keywords = {
            "dj": ["dj", "deejay"],
            "musician": [
                "musician",
                "musicians",
                "band",
                "bands",
                "guitarist",
                "singer",
                "singers",
                "duo",
                "trio",
                "quartet",
            ],
            "photographer": ["photographer", "photo", "photoshoot", "pictures"],
            "videographer": ["videographer", "videography", "video filming"],
            "sound_service": [
                "sound service",
                "pa system",
                "sound system",
                "audio hire",
            ],
            "wedding_venue": ["wedding venue", "reception venue", "venue"],
            "caterer": ["caterer", "catering", "food"],
            "bartender": ["bartender", "barman", "cocktails", "bar service"],
            "speaker": ["speaker", "keynote speaker"],
            "mc_host": [
                "mc & host",
                "mc / host",
                "mc and host",
                "emcee",
                "meister of ceremonies",
            ],
        }

        # Only set category if the UI did not already set one.
        if not cat:
            for slug, words in category_keywords.items():
                if any(w in query_lower for w in words):
                    cat = slug
                    break

        # Only infer date/location/budget when not already provided.
        if when_val is None:
            when_val = _extract_date_from_query(query_lower)

        if loc is None:
            loc = _extract_location_from_query(query_lower)

        if min_price is None or max_price is None:
            heur_min, heur_max = _extract_budget_from_query(query_lower)
            if min_price is None and heur_min is not None:
                min_price = heur_min
            if max_price is None and heur_max is not None:
                max_price = heur_max

    heuristic = AiSearchFilters(
        category=cat,
        location=loc,
        when=when_val,
        min_price=min_price,
        max_price=max_price,
    )

    # ── 2) Optional Gemini/Gemma refinement ──────────────────────────────────
    api_key = (getattr(settings, "GOOGLE_GENAI_API_KEY", "") or "").strip()
    model_name = (getattr(settings, "GOOGLE_GENAI_MODEL", "") or "").strip() or "gemini-2.5-flash"
    if not api_key or not model_name:
        return heuristic

    try:
        from google import genai  # type: ignore
    except Exception:
        # Library not installed or import failed; avoid breaking search.
        logger.warning("google-genai not available; falling back to heuristic filters")
        return heuristic

    # Prepare a compact JSON snippet of the existing filters to give the model context.
    base_payload = {
        "category": heuristic.category,
        "location": heuristic.location,
        "when": heuristic.when.isoformat() if heuristic.when else None,
        "min_price": heuristic.min_price,
        "max_price": heuristic.max_price,
    }

    system_instructions = (
        "You help interpret event search queries for a South African booking site (Booka). "
        "Given a user query and existing filters, you output ONLY a compact JSON object with "
        "the fields: category, location, when, min_price, max_price. "
        "Use null for any field you cannot infer. "
        "Do not include any prose or explanation outside of the JSON."
    )

    base_json = orjson_dumps(base_payload).decode("utf-8")

    prompt = (
        f"{system_instructions}\n\n"
        f"Existing filters (JSON): {base_json}\n"
        f"User query: {query.strip()}\n\n"
        "Respond with JSON only, like:\n"
        '{"category": "dj", "location": "Cape Town", "when": "2026-10-14", "min_price": null, "max_price": 8000}\n'
    )

    try:
        client = genai.Client(api_key=api_key)
        res = client.models.generate_content(model=model_name, contents=prompt)
        text = (getattr(res, "text", None) or "").strip()
        if not text:
            logger.debug("GenAI returned empty text; falling back to heuristic filters")
            return heuristic

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
            logger.debug("GenAI response is not a JSON object; falling back to heuristic filters")
            return heuristic
    except Exception as exc:
        logger.warning("GenAI filter derivation failed: %s", exc)
        return heuristic

    # Merge AI-derived filters with the baseline, giving precedence to baseline
    # (UI + heuristic) values when present.
    category = heuristic.category or (data.get("category") or None)
    if isinstance(category, str):
        category = category.strip() or None

    location = heuristic.location or (data.get("location") or None)
    if isinstance(location, str):
        location = location.strip() or None

    when_val = heuristic.when
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

    min_price = heuristic.min_price
    if min_price is None:
        min_price = _num(data.get("min_price"))

    max_price = heuristic.max_price
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


def _search_providers_with_filters(
    db: Session, filters: AiSearchFilters, limit: int, query_text: Optional[str] = None
) -> List[Dict[str, Any]]:
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

    # Aggregate very simple popularity metrics per artist so Gemini can talk
    # about “famous on Booka” in a grounded way.
    bookings_subq = (
        db.query(
            Booking.artist_id.label("artist_id"),
            func.count(Booking.id).label("booking_count"),
        )
        .group_by(Booking.artist_id)
        .subquery()
    )

    views_subq = (
        db.query(
            ArtistProfileView.artist_id.label("artist_id"),
            func.count(ArtistProfileView.id).label("profile_view_count"),
        )
        .group_by(ArtistProfileView.artist_id)
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
            bookings_subq.c.booking_count,
            views_subq.c.profile_view_count,
            category_subq.c.service_categories,
            category_subq.c.service_min_price,
        )
        .outerjoin(rating_subq, rating_subq.c.artist_id == Artist.user_id)
        .outerjoin(bookings_subq, bookings_subq.c.artist_id == Artist.user_id)
        .outerjoin(views_subq, views_subq.c.artist_id == Artist.user_id)
        .outerjoin(category_subq, category_subq.c.artist_id == Artist.user_id)
    )

    # Only include providers with at least one approved service.
    query = query.filter(Artist.services.any(Service.status == "approved"))

    # Apply category/location/price filters first; this forms our base query.
    if filters.category:
        category_slug = filters.category.lower().replace(" ", "_")
        category_term = category_slug.replace("_", " ")
        query = (
            query.join(Service, Service.artist_id == Artist.user_id)
            .join(ServiceCategory, Service.service_category_id == ServiceCategory.id)
            .filter(getattr(Service, "status", "approved") == "approved")
            # Use a contains match rather than strict equality so "Musician / Band"
            # and similar names still match a "musician" category.
            .filter(func.lower(ServiceCategory.name).ilike(f"%{category_term}%"))
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
            bookings_subq.c.booking_count,
            views_subq.c.profile_view_count,
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

    base_query = query

    rows: List[Any] = []

    # Optional: name-based narrowing/boosting when the query looks like a name.
    if query_text:
        try:
            q = (query_text or "").lower()
            tokens = re.findall(r"[a-z0-9]+", q)
            stopwords = {
                "i",
                "im",
                "i'm",
                "looking",
                "for",
                "a",
                "an",
                "the",
                "please",
                "need",
                "want",
                "search",
                "find",
                "booking",
                "book",
            }
            raw_tokens = [t for t in tokens if t not in stopwords and len(t) >= 3]
            # Words that are likely "type" descriptors rather than names
            type_words = {
                "dj",
                "deejay",
                "musician",
                "musicians",
                "band",
                "bands",
                "guitarist",
                "singer",
                "singers",
                "duo",
                "trio",
                "quartet",
                "photographer",
                "photography",
                "videographer",
                "videography",
                "sound",
                "service",
                "caterer",
                "catering",
                "bartender",
                "barman",
                "speaker",
                "venue",
                "wedding",
            }
            name_tokens = [t for t in raw_tokens if t not in type_words]
            if name_tokens:
                # Require at least one token to appear in the business or user name.
                name_clauses = [
                    func.lower(Artist.business_name).ilike(f"%{tok}%")
                    for tok in name_tokens
                ] + [
                    func.lower(User.first_name).ilike(f"%{tok}%")
                    for tok in name_tokens
                ] + [
                    func.lower(User.last_name).ilike(f"%{tok}%")
                    for tok in name_tokens
                ]

                name_query = (
                    base_query.join(User, User.id == Artist.user_id).filter(
                        or_(*name_clauses)
                    )
                )

                # Ordering: favor recently updated artists with higher ratings.
                name_query = name_query.order_by(
                    func.coalesce(rating_subq.c.rating, 0.0).desc(),
                    Artist.updated_at.desc(),
                )
                rows = name_query.limit(limit).all()
        except Exception:
            # Never break search on name parsing errors.
            rows = []

    if not rows:
        # Fallback: run the base query without name narrowing.
        fallback_query = base_query.order_by(
            func.coalesce(rating_subq.c.rating, 0.0).desc(),
            Artist.updated_at.desc(),
        )
        rows = fallback_query.limit(limit).all()

    providers: List[Dict[str, Any]] = []
    frontend_base = FRONTEND_PRIMARY.rstrip("/")

    for (
        artist,
        rating,
        rating_count,
        booking_count,
        profile_view_count,
        service_categories,
        service_min_price,
    ) in rows:
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

        artist_id = int(getattr(artist, "user_id", 0) or 0)

        client_total_preview: Optional[float] = None
        try:
            if service_min_price is not None:
                snap = compute_quote_totals_snapshot(
                    {"subtotal": service_min_price, "total": service_min_price, "currency": "ZAR"}
                )
                if snap is not None and getattr(snap, "client_total_incl_vat", None) is not None:
                    client_total_preview = float(snap.client_total_incl_vat)
        except Exception:
            client_total_preview = None

        providers.append(
            {
                "artist_id": artist_id,
                "slug": slug,
                "name": name,
                "location": location,
                "categories": categories,
                "rating": float(rating) if rating is not None else None,
                "review_count": int(rating_count or 0) if rating_count is not None else None,
                "booking_count": int(booking_count or 0) if booking_count is not None else None,
                "profile_view_count": int(profile_view_count or 0)
                if profile_view_count is not None
                else None,
                "starting_price": float(service_min_price) if service_min_price is not None else None,
                "client_total_preview": client_total_preview,
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

    providers = _search_providers_with_filters(
        db,
        effective_filters,
        limit,
        query_text=query_text,
    )

    # After we have candidate providers, optionally let Gemini rerank them and
    # generate a more human explanation. This is best-effort and fully
    # optional; on any error we fall back to the original ordering and a
    # generic explanation.
    def _filters_to_json(f: AiSearchFilters) -> Dict[str, Any]:
        return {
            "category": f.category,
            "location": f.location,
            "when": f.when.isoformat() if f.when else None,
            "min_price": f.min_price,
            "max_price": f.max_price,
        }

    filters_out: Dict[str, Any] = _filters_to_json(effective_filters)

    explanation = (
        "I used your query and filters to suggest matching service providers in your area."
    )

    api_key = (getattr(settings, "GOOGLE_GENAI_API_KEY", "") or "").strip()
    model_name = (getattr(settings, "GOOGLE_GENAI_MODEL", "") or "").strip() or "gemini-2.5-flash"

    # Optional Gemini step: can run even when there are zero providers so it
    # can generate a helpful “no results” explanation, but reranking only
    # applies when we have candidates.
    if api_key and model_name:
        try:
            from google import genai  # type: ignore

            # Keep the payload compact to control latency and token usage, but
            # include Booka-centric popularity signals so we can answer things
            # like “most famous on the platform” or “is X popular on Booka”.
            top_providers = providers[:12] if providers else []
            provider_payload: List[Dict[str, Any]] = []
            for idx, p in enumerate(top_providers):
                provider_payload.append(
                    {
                        "index": idx,
                        "slug": p.get("slug"),
                        "name": p.get("name"),
                        "location": p.get("location"),
                        "categories": p.get("categories"),
                        "rating": p.get("rating"),
                        "review_count": p.get("review_count"),
                        "booking_count": p.get("booking_count"),
                        "profile_view_count": p.get("profile_view_count"),
                        "starting_price": p.get("starting_price"),
                    }
                )

            system_instructions = (
                "You are helping users find the best matching service providers on Booka, a South African booking site. "
                "You are given the user's query, interpreted filters, and a small list of candidate providers, each with "
                "Booka-specific popularity metrics (rating, number of reviews, booking_count, profile_view_count). "
                "Your job is to (1) choose the most relevant providers (when any candidates exist) and (2) explain in one "
                "or two short sentences why you chose them, strictly in terms of their popularity and fit on Booka.\n\n"
                "Important rules:\n"
                "- Treat higher review_count, booking_count, and rating as signals that an artist is more popular ON BOOKA.\n"
                "- If the user asks about “famous” or “biggest” or “most popular”, prefer artists with higher popularity signals.\n"
                "- If the user mentions a specific name, prioritise exact or very close name matches when possible.\n"
                "- NEVER claim anything about fame or popularity outside Booka (e.g., “in South Africa” or “worldwide”). "
                "If the question mentions fame in South Africa, answer in terms of Booka only, e.g. "
                "“On Booka, X has Y reviews and Z bookings; we can’t speak for all of South Africa.”\n"
                "- For “are there any … listed?” or similar yes/no questions, your explanation MUST clearly say whether there "
                "are any matching providers in the candidate list and how many you found, based on the length of the candidates array "
                "(e.g., “Yes – I found 4 DJs on Booka that match your request; here are a few of the top ones.”).\n"
                "- If the candidates array is empty, your explanation MUST make it clear that no providers on Booka matched the user's "
                "request and optionally suggest broadening the filters or trying a simpler query.\n"
                "- Do not invent providers that are not in the candidate list.\n\n"
                "You MUST respond with a single JSON object only, no prose outside JSON, with this shape:\n"
                '{\"ordered_indices\": [0,1,2], \"explanation\": \"...\"}\n'
                "The ordered_indices array must reference the 'index' field of the candidate providers."
            )

            payload_json = {
                "query": query_text,
                "filters": filters_out,
                "candidates": provider_payload,
            }

            payload_str = orjson_dumps(payload_json).decode("utf-8")

            prompt = (
                f"{system_instructions}\n\n"
                f"INPUT JSON:\n{payload_str}\n\n"
                "Respond with JSON only."
            )

            client = genai.Client(api_key=api_key)
            res = client.models.generate_content(model=model_name, contents=prompt)
            text = (getattr(res, "text", None) or "").strip()
            if text:
                start = text.find("{")
                end = text.rfind("}")
                if start != -1 and end != -1 and end > start:
                    json_str = text[start : end + 1]
                else:
                    json_str = text

                data = json.loads(json_str)
                if isinstance(data, dict):
                    ordered_indices = data.get("ordered_indices")
                    ai_expl = data.get("explanation")
                    if isinstance(ordered_indices, list) and ordered_indices:
                        # Sanitize indices and map back into our providers list.
                        new_list: List[Dict[str, Any]] = []
                        seen = set()
                        for idx in ordered_indices:
                            try:
                                i = int(idx)
                            except Exception:
                                continue
                            if 0 <= i < len(top_providers) and i not in seen:
                                new_list.append(top_providers[i])
                                seen.add(i)
                        # If AI gave at least one valid index, adopt this ordering
                        if new_list:
                            providers = new_list
                    if isinstance(ai_expl, str) and ai_expl.strip():
                        explanation = ai_expl.strip()
        except Exception as exc:
            # Never let AI rerank/explanation failures break the endpoint.
            logger.warning("GenAI rerank/explanation failed: %s", exc)

    return {
        "providers": providers,
        "filters": filters_out,
        "explanation": explanation,
        "source": "ai_v1",
    }
