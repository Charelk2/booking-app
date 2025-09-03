from datetime import date
import logging
from fastapi import APIRouter, Query, status

from ..utils.errors import error_response
from ..services import flight_service

router = APIRouter(tags=["flights"])
logger = logging.getLogger(__name__)


@router.get("/flights/cheapest")
def cheapest_morning_flight(
    departure: str = Query(..., min_length=3, max_length=3),
    arrival: str = Query(..., min_length=3, max_length=3),
    date_param: date = Query(..., alias="date"),
):
    """Return the cheapest morning flight price."""
    try:
        price = flight_service.get_cheapest_morning_flight(
            departure.upper(), arrival.upper(), date_param
        )
        return {"price": float(price)}
    except flight_service.FlightAPIError as exc:  # pragma: no cover - network
        logger.error(
            "Flight API error for %s-%s on %s: %s",
            departure,
            arrival,
            date_param,
            exc,
            exc_info=True,
        )
        raise error_response(
            "Flight service error",
            {},
            status.HTTP_502_BAD_GATEWAY,
        )
