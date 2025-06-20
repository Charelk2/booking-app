from datetime import datetime, timedelta
import logging

from fastapi import APIRouter, Depends
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
    return {"connected": account is not None}


@router.get("/google-calendar/connect")
def connect_google_calendar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    url = calendar_service.get_auth_url(current_user.id, settings.GOOGLE_REDIRECT_URI)
    return {"auth_url": url}


@router.get("/google-calendar/callback")
def google_calendar_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    user_id = int(state)
    calendar_service.exchange_code(user_id, code, settings.GOOGLE_REDIRECT_URI, db)
    redirect_target = getattr(settings, "FRONTEND_URL", "/")
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

