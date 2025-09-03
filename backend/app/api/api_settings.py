from fastapi import APIRouter
import logging
from ..core.config import settings

router = APIRouter(tags=["settings"])
logger = logging.getLogger(__name__)


@router.get("/settings")
async def get_settings():
    """Return selected public configuration values."""
    logger.info("Serving DEFAULT_CURRENCY=%s", settings.DEFAULT_CURRENCY)
    return {"default_currency": settings.DEFAULT_CURRENCY}
