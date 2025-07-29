import os
import logging
import httpx
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

router = APIRouter(tags=["distance"])
logger = logging.getLogger(__name__)


@router.get("/distance")
def get_distance(from_location: str, to_location: str):
    """Proxy Google Distance Matrix API and return its JSON response."""
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        logger.error("GOOGLE_MAPS_API_KEY is not configured")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "GOOGLE_MAPS_API_KEY not set"},
        )

    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    params = {
        "units": "metric",
        "origins": from_location,
        "destinations": to_location,
        "key": api_key,
    }
    logger.debug(
        "Distance Matrix request: origins=%s destinations=%s",
        from_location,
        to_location,
    )
    logger.debug("Distance Matrix request params: %s", params)
    try:
        resp = httpx.get(url, params=params, timeout=10)
        logger.debug("Distance Matrix raw response: %s", resp.text)
        resp.raise_for_status()
        data = resp.json()
        return data
    except Exception as exc:  # pragma: no cover - network failure
        logger.error("Distance Matrix request failed: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"error": "Failed to fetch distance"},
        )
