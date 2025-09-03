from typing import Dict
from fastapi import HTTPException, status
import logging

logger = logging.getLogger(__name__)


def error_response(
    message: str,
    field_errors: Dict[str, str],
    code: int = status.HTTP_422_UNPROCESSABLE_ENTITY,
) -> HTTPException:
    """Return an HTTPException with a consistent structure and log details."""
    logger.error("%s %s", message, field_errors)
    detail = {"message": message, "field_errors": field_errors}
    return HTTPException(status_code=code, detail=detail)

