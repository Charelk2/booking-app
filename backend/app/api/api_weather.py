from fastapi import APIRouter, Query, status
import logging

from ..utils.errors import error_response
from ..services import weather_service
from ..utils import background_worker

router = APIRouter(tags=["travel-forecast"])
logger = logging.getLogger(__name__)


@router.get("/travel-forecast", status_code=status.HTTP_202_ACCEPTED)
def travel_forecast(location: str = Query(..., min_length=1)):
    """Queue a weather forecast fetch and return a task identifier."""

    task_id = background_worker.enqueue(weather_service.get_3day_forecast, location)
    return {"task_id": task_id}


@router.get("/travel-forecast/{task_id}")
async def travel_forecast_result(task_id: str):
    """Return the queued weather forecast result."""

    try:
        return await background_worker.result(task_id)
    except KeyError:
        raise error_response("Task not found", {"task_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    except weather_service.LocationNotFoundError:
        raise error_response("Invalid location", {"location": "Unknown location"})
    except weather_service.WeatherAPIError as exc:  # pragma: no cover - network
        logger.error("Weather API error: %s", exc, exc_info=True)
        raise error_response(
            "Weather service error",
            {},
            status.HTTP_502_BAD_GATEWAY,
        )
