from fastapi import APIRouter, Query, status
import logging

from ..utils.errors import error_response
from ..services import weather_service

router = APIRouter(tags=["travel-forecast"])
logger = logging.getLogger(__name__)


@router.get("/travel-forecast")
def travel_forecast(location: str = Query(..., min_length=1)):
    """Return a 3-day weather forecast for the destination."""
    try:
        return weather_service.get_3day_forecast(location)
    except weather_service.LocationNotFoundError:
        raise error_response("Invalid location", {"location": "Unknown location"})
    except weather_service.WeatherAPIError as exc:  # pragma: no cover - network
        logger.error("Weather API error for %s: %s", location, exc, exc_info=True)
        raise error_response(
            "Weather service error",
            {},
            status.HTTP_502_BAD_GATEWAY,
        )
