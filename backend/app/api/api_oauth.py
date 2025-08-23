from fastapi import APIRouter, Request, Depends, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta
import secrets
import logging
from urllib.parse import quote

from authlib.integrations.starlette_client import OAuth

from app.core.config import settings
from app.database import get_db
from app.models import User, UserType
from app.api.auth import (
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_user_by_email,
    _create_refresh_token,
    _store_refresh_token,
    _set_access_cookie,
    _set_refresh_cookie,
)
from app.utils.auth import get_password_hash, normalize_email
from app.utils import error_response

router = APIRouter()

logger = logging.getLogger(__name__)

oauth = OAuth()

# Allow fallback to GOOGLE_CLIENT_ID/SECRET if OAUTH-specific vars aren't set
_google_oauth_client_id = settings.GOOGLE_OAUTH_CLIENT_ID or settings.GOOGLE_CLIENT_ID
_google_oauth_client_secret = settings.GOOGLE_OAUTH_CLIENT_SECRET or settings.GOOGLE_CLIENT_SECRET

if _google_oauth_client_id:
    oauth.register(
        name="google",
        client_id=_google_oauth_client_id,
        client_secret=_google_oauth_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        api_base_url="https://openidconnect.googleapis.com/v1/",
        client_kwargs={"scope": "openid email profile"},
    )
    try:
        # Safe, non-sensitive confirmation that Google OAuth is wired
        logger.info("Google OAuth registered (client_id suffix=%s)", _google_oauth_client_id[-20:])
    except Exception:
        logger.info("Google OAuth registered")

# Sign in with Apple (conditionally registered when credentials are present)
if getattr(settings, "APPLE_CLIENT_ID", None) and getattr(settings, "APPLE_TEAM_ID", None) and getattr(settings, "APPLE_KEY_ID", None) and getattr(settings, "APPLE_PRIVATE_KEY", None):
    # Authlib supports Apple OpenID; client_secret must be a signed JWT
    # constructed from APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.
    # We let Authlib build it via client_kwargs below.
    oauth.register(
        name="apple",
        client_id=settings.APPLE_CLIENT_ID,
        client_secret=settings.APPLE_PRIVATE_KEY,  # Authlib expects the private key and will sign.
        server_metadata_url="https://appleid.apple.com/.well-known/openid-configuration",
        client_kwargs={
            "scope": "name email",
            "token_endpoint_auth_method": "client_secret_post",
        },
    )


@router.get("/google/login")
async def google_login(
    request: Request,
    next: str = settings.FRONTEND_URL.rstrip("/") + "/dashboard",
):
    """Start Google OAuth flow."""
    if not hasattr(oauth, "google"):
        raise error_response(
            "Google OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri, state=next)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    if not hasattr(oauth, "google"):
        raise error_response(
            "Google OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    next_url = request.query_params.get("state") or settings.FRONTEND_URL
    if next_url.startswith("/"):
        next_url = settings.FRONTEND_URL.rstrip("/") + next_url
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:  # pragma: no cover - network/token errors
        logger.error("Google token exchange failed: %s", exc)
        raise error_response(
            "Google authentication failed",
            {},
            status.HTTP_400_BAD_REQUEST,
        )

    profile = None
    try:
        profile = await oauth.google.parse_id_token(request, token)
    except KeyError:
        # Older API responses may not include an id_token field
        profile = None
    except Exception as exc:  # pragma: no cover - unexpected parsing issue
        logger.warning("Failed to parse Google id_token: %s", exc)
        profile = None
    if not profile:
        resp = await oauth.google.get("userinfo", token=token)
        if resp.status_code == 200:
            profile = resp.json()
        else:
            logger.error(
                "Failed Google userinfo fetch: %s %s", resp.status_code, resp.text
            )
            raise error_response(
                "Failed to fetch Google profile",
                {},
                status.HTTP_400_BAD_REQUEST,
            )
    if not profile:
        raise error_response(
            "Failed to fetch Google profile",
            {},
            status.HTTP_400_BAD_REQUEST,
        )
    email = profile.get("email")
    if not email:
        raise error_response(
            "Email not available from Google",
            {},
            status.HTTP_400_BAD_REQUEST,
        )
    first_name = profile.get("given_name") or ""
    last_name = profile.get("family_name") or ""

    email = normalize_email(email)
    # Reuse any existing account matching this canonicalized email
    user = get_user_by_email(db, email)
    if not user:
        user = User(
            email=email,
            password=get_password_hash(secrets.token_hex(8)),
            first_name=first_name or email.split("@")[0],
            last_name=last_name,
            user_type=UserType.CLIENT,
            is_verified=True,
        )
        db.add(user)
    else:
        user.first_name = user.first_name or first_name
        user.last_name = user.last_name or last_name
        user.is_verified = True
    db.commit()
    db.refresh(user)

    # Issue tokens and set HttpOnly cookies; avoid token-in-URL
    expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token({"sub": user.email}, expires)
    refresh_token, r_exp = _create_refresh_token(user.email)
    _store_refresh_token(db, user, refresh_token, r_exp)
    resp = RedirectResponse(url=next_url)
    _set_access_cookie(resp, access_token)
    _set_refresh_cookie(resp, refresh_token, r_exp)
    return resp


@router.get("/apple/login")
async def apple_login(
    request: Request,
    next: str = settings.FRONTEND_URL.rstrip("/") + "/dashboard",
):
    if not hasattr(oauth, "apple"):
        raise error_response(
            "Apple Sign-in not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    redirect_uri = request.url_for("apple_callback")
    return await oauth.apple.authorize_redirect(request, redirect_uri, state=next)


@router.get("/apple/callback")
async def apple_callback(request: Request, db: Session = Depends(get_db)):
    if not hasattr(oauth, "apple"):
        raise error_response(
            "Apple Sign-in not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    next_url = request.query_params.get("state") or settings.FRONTEND_URL
    if next_url.startswith("/"):
        next_url = settings.FRONTEND_URL.rstrip("/") + next_url
    token = await oauth.apple.authorize_access_token(request)
    # Try to parse id_token for profile
    profile = None
    try:
        profile = await oauth.apple.parse_id_token(request, token)
    except Exception:
        profile = None
    if not profile:
        raise error_response(
            "Failed to fetch Apple profile",
            {},
            status.HTTP_400_BAD_REQUEST,
        )
    email = profile.get("email")
    first_name = (profile.get("name") or {}).get("firstName") or profile.get("given_name") or ""
    last_name = (profile.get("name") or {}).get("lastName") or profile.get("family_name") or ""
    if not email:
        # Apple may hide email; in production you'd use the stable sub claim + account linking
        # For now, fail gracefully
        raise error_response("Email not available from Apple", {}, status.HTTP_400_BAD_REQUEST)

    email = normalize_email(email)
    user = get_user_by_email(db, email)
    if not user:
        user = User(
            email=email,
            password=get_password_hash(secrets.token_hex(8)),
            first_name=first_name or email.split("@")[0],
            last_name=last_name,
            user_type=UserType.CLIENT,
            is_verified=True,
        )
        db.add(user)
    else:
        user.first_name = user.first_name or first_name
        user.last_name = user.last_name or last_name
        user.is_verified = True
    db.commit()
    db.refresh(user)

    expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token({"sub": user.email}, expires)
    refresh_token, r_exp = _create_refresh_token(user.email)
    _store_refresh_token(db, user, refresh_token, r_exp)
    resp = RedirectResponse(url=next_url)
    _set_access_cookie(resp, access_token)
    _set_refresh_cookie(resp, refresh_token, r_exp)
    return resp
