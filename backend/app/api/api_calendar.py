from datetime import datetime, timedelta
import logging

from fastapi import APIRouter, Depends, Request
from urllib.parse import urlparse
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.models import User, CalendarAccount, CalendarProvider
from app.api.dependencies import get_current_user
from app.services import calendar_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["google-calendar"])


@router.get("/google-calendar/status")
def google_calendar_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return whether the user has a connected Google Calendar."""
    account = (
        db.query(CalendarAccount)
        .filter(
            CalendarAccount.user_id == current_user.id,
            CalendarAccount.provider == CalendarProvider.GOOGLE,
        )
        .first()
    )
    if account is None:
        return {"connected": False}
    return {"connected": True, "email": account.email}


def _effective_redirect_uri(request: Request) -> str:
    # Allow explicit override when running behind proxies/subdomains where
    # request.url_for may not reflect the authorized Google redirect exactly.
    if settings.GOOGLE_OAUTH_REDIRECT_URI:
        return settings.GOOGLE_OAUTH_REDIRECT_URI
    candidate = str(request.url_for("google_calendar_callback"))
    parsed = urlparse(candidate)
    host = (parsed.hostname or "").lower()
    # Google allows http only for localhost/127.0.0.1; otherwise require https
    if parsed.scheme == "https" or host in {"localhost", "127.0.0.1"}:
        return candidate
    # Fallback to configured redirect (e.g., localhost or production https)
    return settings.GOOGLE_REDIRECT_URI


@router.get("/google-calendar/connect")
def connect_google_calendar(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    redirect_uri = _effective_redirect_uri(request)
    url = calendar_service.get_auth_url(current_user.id, redirect_uri)
    return {"auth_url": url}


@router.get("/google-calendar/callback")
def google_calendar_callback(
    request: Request,
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    user_id = calendar_service.resolve_calendar_state(state)
    status = "success"
    if user_id is None:
        logger.error("Invalid Google Calendar state value", extra={"state": state})
        status = "error"
        redirect_target = f"{settings.FRONTEND_URL}/dashboard/profile/edit?calendarSync={status}"
        return RedirectResponse(url=redirect_target)
    try:
        redirect_uri = _effective_redirect_uri(request)
        calendar_service.exchange_code(user_id, code, redirect_uri, db)
    except Exception as exc:  # noqa: BLE001
        status = "error"
        logger.error(
            "Failed to exchange Google Calendar auth code: %s", exc, exc_info=True
        )
    redirect_target = f"{settings.FRONTEND_URL}/dashboard/profile/edit?calendarSync={status}"
    return RedirectResponse(url=redirect_target)


@router.delete("/google-calendar")
def disconnect_google_calendar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = (
        db.query(CalendarAccount)
        .filter(
            CalendarAccount.user_id == current_user.id,
            CalendarAccount.provider == CalendarProvider.GOOGLE,
        )
        .first()
    )
    if account:
        db.delete(account)
        db.commit()
    return {"status": "deleted"}
