import os
import logging
from datetime import date, datetime
from decimal import Decimal
import httpx

logger = logging.getLogger(__name__)

class FlightAPIError(Exception):
    """General flight service failure."""


def get_cheapest_morning_flight(departure: str, arrival: str, flight_date: date) -> Decimal:
    """Return the cheapest fare for flights departing before noon."""
    api_key = os.getenv("FLIGHT_API_KEY")
    if not api_key:
        logger.error("FLIGHT_API_KEY not set")
        raise FlightAPIError("API key missing")

    url = "https://api.travelpayouts.com/v2/prices/latest"
    params = {
        "origin": departure,
        "destination": arrival,
        "depart_date": flight_date.isoformat(),
        "one_way": "true",
        "currency": "ZAR",
        "token": api_key,
    }

    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
    except Exception as exc:  # pragma: no cover - network failure path
        logger.error("Flight API request failed: %s", exc, exc_info=True)
        raise FlightAPIError("Flight service unreachable") from exc

    try:
        data = resp.json()
    except ValueError as exc:  # pragma: no cover - bad JSON
        logger.error("Flight API returned invalid JSON: %s", exc, exc_info=True)
        raise FlightAPIError("Invalid response from flight service") from exc

    flights = data.get("data")
    if not isinstance(flights, list):
        logger.error("Flight API response missing data field: %s", data)
        raise FlightAPIError("Unexpected flight service response")

    cheapest: Decimal | None = None
    for flight in flights:
        dep_time = flight.get("departure_at")
        price = flight.get("price")
        if not dep_time or price is None:
            continue
        try:
            dt = datetime.fromisoformat(dep_time.replace("Z", "+00:00"))
        except ValueError:
            logger.warning("Invalid departure time %s", dep_time)
            continue
        if dt.hour >= 12:
            continue
        try:
            cost = Decimal(str(price))
        except (ValueError, TypeError):
            logger.warning("Invalid price %s", price)
            continue
        if cheapest is None or cost < cheapest:
            cheapest = cost
    if cheapest is None:
        logger.error("No morning flights found in response: %s", data)
        raise FlightAPIError("No valid flights returned")
    return cheapest
