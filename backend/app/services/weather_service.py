import logging
import httpx

logger = logging.getLogger(__name__)

class WeatherAPIError(Exception):
    """General weather service failure."""

class LocationNotFoundError(Exception):
    """Raised when the service cannot find the location."""


def get_3day_forecast(location: str) -> dict:
    """Return a 3-day weather forecast for the given location."""
    url = f"https://wttr.in/{location}"
    try:
        resp = httpx.get(url, params={"format": "j1"}, timeout=10)
        resp.raise_for_status()
    except Exception as exc:  # pragma: no cover - network failure path
        logger.error("Weather API request failed: %s", exc, exc_info=True)
        raise WeatherAPIError("Weather service unreachable") from exc

    try:
        data = resp.json()
    except ValueError as exc:
        logger.error("Weather API returned invalid JSON: %s", exc, exc_info=True)
        raise WeatherAPIError("Invalid response from weather service") from exc

    forecast = data.get("weather")
    if not forecast:
        logger.warning("No forecast data returned for location %s", location)
        raise LocationNotFoundError(location)

    return {"location": location, "forecast": forecast[:3]}
