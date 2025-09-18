"""Helpers for Google Calendar OAuth and event sync."""

from datetime import datetime
from typing import List, Optional
import logging

from fastapi import HTTPException
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google.auth.exceptions import RefreshError
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.auth.utils import new_oauth_state
from app.core.config import settings
from app.models import CalendarAccount, CalendarProvider
from app.utils.redis_cache import get_redis_client

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
]

_CALENDAR_STATE_PREFIX = "oauth:calendar:state:"
_CALENDAR_STATE_TTL = 600  # 10 minutes


def _require_credentials() -> None:
    """Ensure Google OAuth credentials are configured."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        logger.warning("Google Calendar credentials not configured")
        raise HTTPException(500, "Google Calendar credentials not configured")


def require_credentials() -> None:
    """Public wrapper for :func:`_require_credentials` for easier patching."""
    _require_credentials()


def _flow(redirect_uri: str, flow_cls: type[Flow] = Flow) -> Flow:
    return flow_cls.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uris": [redirect_uri],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )


def _store_calendar_state(state: str, user_id: int) -> None:
    client = get_redis_client()
    try:
        client.setex(f"{_CALENDAR_STATE_PREFIX}{state}", _CALENDAR_STATE_TTL, str(user_id))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to persist calendar OAuth state: %s", exc)
        raise


def _pop_calendar_state(state: str) -> Optional[int]:
    client = get_redis_client()
    try:
        key = f"{_CALENDAR_STATE_PREFIX}{state}"
        raw = client.get(key)
        if raw is None:
            return None
        try:
            client.delete(key)
        except Exception:
            pass
        return int(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to read calendar OAuth state: %s", exc)
        return None


def get_auth_url(user_id: int, redirect_uri: str) -> str:
    """Return the Google OAuth authorization URL for the user."""
    require_credentials()
    flow = _flow(redirect_uri)

    # Prefer a random state stored server-side; fall back to user_id on failure.
    state_token = None
    try:
        state_token = new_oauth_state()
        _store_calendar_state(state_token, user_id)
    except Exception:  # noqa: BLE001
        state_token = str(user_id)

    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state_token,
    )
    return auth_url


def resolve_calendar_state(state: str) -> Optional[int]:
    """Convert the OAuth state string back into the originating user id."""
    user_id = _pop_calendar_state(state)
    if user_id is not None:
        return user_id
    try:
        return int(state)
    except (TypeError, ValueError):
        return None


def exchange_code(user_id: int, code: str, redirect_uri: str, db: Session) -> None:
    """Exchange OAuth code for tokens and store them."""
    require_credentials()
    flow = _flow(redirect_uri)
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        logger.error("Google OAuth flow returned no refresh token")
        raise HTTPException(400, "Missing refresh token from Google")
    email = None
    try:
        user_service = build("oauth2", "v2", credentials=creds)
        email = user_service.userinfo().get().execute().get("email")
    except HttpError as exc:  # noqa: BLE001
        logger.error("Failed to fetch Google account email: %s", exc, exc_info=True)

    account = (
        db.query(CalendarAccount)
        .filter(
            CalendarAccount.user_id == user_id,
            CalendarAccount.provider == CalendarProvider.GOOGLE,
        )
        .first()
    )
    if account is None:
        account = CalendarAccount(
            user_id=user_id, provider=CalendarProvider.GOOGLE
        )
    account.refresh_token = creds.refresh_token
    account.access_token = creds.token
    account.token_expiry = creds.expiry
    if email:
        account.email = email
    db.add(account)
    db.commit()


def fetch_events(user_id: int, start: datetime, end: datetime, db: Session) -> List[datetime]:
    """Return start times of events from the user's Google Calendar."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        logger.warning("Google Calendar credentials not configured; skipping fetch")
        return []
    account = (
        db.query(CalendarAccount)
        .filter(
            CalendarAccount.user_id == user_id,
            CalendarAccount.provider == CalendarProvider.GOOGLE,
        )
        .first()
    )
    if not account:
        return []

    creds = Credentials(
        token=account.access_token,
        refresh_token=account.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
    )
    try:
        if creds.expired:
            try:
                creds.refresh(Request())
            except RefreshError as exc:
                logger.error(
                    "Failed to refresh Google token for user %s: %s",
                    user_id,
                    exc,
                    exc_info=True,
                )
                db.delete(account)
                db.commit()
                raise HTTPException(502, "Failed to refresh calendar credentials") from exc

            account.access_token = creds.token
            account.token_expiry = creds.expiry
            db.add(account)
            db.commit()
        service = build("calendar", "v3", credentials=creds)
        events = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=start.isoformat() + "Z",
                timeMax=end.isoformat() + "Z",
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )
    except HttpError as exc:
        logger.error("Google Calendar API error: %s", exc, exc_info=True)
        raise HTTPException(502, "Failed to fetch calendar events") from exc
    except RefreshError as exc:
        logger.error("Google token refresh failed for user %s: %s", user_id, exc, exc_info=True)
        db.delete(account)
        db.commit()
        raise HTTPException(502, "Failed to refresh calendar credentials") from exc

    results: List[datetime] = []
    for item in events.get("items", []):
        date_str = item.get("start", {}).get("dateTime") or item.get("start", {}).get("date")
        if date_str:
            try:
                results.append(datetime.fromisoformat(date_str.replace("Z", "+00:00")))
            except ValueError:
                continue
    return results
