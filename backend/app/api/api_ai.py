from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.database import get_db
from sqlalchemy.orm import Session
from app.services.ai_search import ai_provider_search


router = APIRouter()


class AiProviderSearchRequest(BaseModel):
    query: str = Field(..., description="Free-form description of the event / needs.")
    category: Optional[str] = Field(
        None, description="Optional service category slug, e.g. 'dj', 'musician'."
    )
    location: Optional[str] = Field(
        None, description="Optional location hint, e.g. 'Cape Town'."
    )
    when: Optional[str] = Field(
        None, description="Optional event date in YYYY-MM-DD format."
    )
    min_price: Optional[float] = Field(
        None, description="Minimum budget in ZAR."
    )
    max_price: Optional[float] = Field(
        None, description="Maximum budget in ZAR."
    )
    limit: Optional[int] = Field(
        6, description="Maximum number of suggestions to return."
    )


class AiProviderOut(BaseModel):
    slug: str
    name: str
    location: str
    categories: Optional[List[str]] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    starting_price: Optional[float] = None
    profile_url: str
    avatar_url: Optional[str] = None
    relevance_score: Optional[float] = None


class AiProviderFilters(BaseModel):
    category: Optional[str] = None
    location: Optional[str] = None
    when: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None


class AiProviderSearchResponse(BaseModel):
    providers: List[AiProviderOut]
    filters: AiProviderFilters
    explanation: str
    source: Optional[str] = None


@router.post(
    "/ai/providers/search",
    response_model=AiProviderSearchResponse,
    response_model_exclude_none=True,
    summary="AI-assisted provider search for Booka frontends",
)
def ai_providers_search(
    payload: AiProviderSearchRequest,
    db: Session = Depends(get_db),
):
    """AI-assisted provider search.

    This endpoint interprets a natural language *query* in combination with
    optional structured filters (category, location, date, budget) and returns
    a small list of suggested providers along with the interpreted filters.

    Behavior is gated behind the FEATURE_AI_SEARCH flag. When disabled, the
    endpoint returns HTTP 503 with a machine-readable detail.
    """
    if not getattr(settings, "FEATURE_AI_SEARCH", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ai_search_disabled",
        )

    try:
        result = ai_provider_search(db, payload.model_dump())
    except ValueError as exc:
        if str(exc) == "query_required":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"query": "required"},
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ai_search_invalid",
        )
    except RuntimeError as exc:
        if str(exc) == "ai_search_disabled":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="ai_search_disabled",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ai_search_error",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ai_search_error",
        )

    return result

