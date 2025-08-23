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

if settings.GITHUB_CLIENT_ID:
    oauth.register(
        name="github",
        client_id=settings.GITHUB_CLIENT_ID,
        client_secret=settings.GITHUB_CLIENT_SECRET,
        access_token_url="https://github.com/login/oauth/access_token",
        authorize_url="https://github.com/login/oauth/authorize",
        api_base_url="https://api.github.com/",
        client_kwargs={"scope": "user:email"},
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

    expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    jwt_token = create_access_token({"sub": user.email}, expires)
    next_part = (
        next_url[len(settings.FRONTEND_URL.rstrip("/")) :]
        if next_url.startswith(settings.FRONTEND_URL)
        else next_url
    )
    login_redirect = (
        f"{settings.FRONTEND_URL.rstrip('/')}/login?token={jwt_token}"
        f"&next={quote(next_part, safe='')}"
    )
    return RedirectResponse(url=login_redirect)


@router.get("/github/login")
async def github_login(
    request: Request,
    next: str = settings.FRONTEND_URL.rstrip("/") + "/dashboard",
):
    """Start GitHub OAuth flow."""
    if not hasattr(oauth, "github"):
        raise error_response(
            "GitHub OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    redirect_uri = request.url_for("github_callback")
    return await oauth.github.authorize_redirect(request, redirect_uri, state=next)


@router.get("/github/callback")
async def github_callback(request: Request, db: Session = Depends(get_db)):
    if not hasattr(oauth, "github"):
        raise error_response(
            "GitHub OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    next_url = request.query_params.get("state") or settings.FRONTEND_URL
    if next_url.startswith("/"):
        next_url = settings.FRONTEND_URL.rstrip("/") + next_url
    token = await oauth.github.authorize_access_token(request)
    resp = await oauth.github.get("user", token=token)
    profile = resp.json()
    email = profile.get("email")
    if not email:
        r = await oauth.github.get("user/emails", token=token)
        for entry in r.json():
            if entry.get("primary"):
                email = entry.get("email")
                break
        if not email and r.json():
            email = r.json()[0].get("email")
    if not email:
        raise error_response(
            "Email not available from GitHub",
            {},
            status.HTTP_400_BAD_REQUEST,
        )
    name = profile.get("name") or profile.get("login")
    parts = name.split()
    first_name = parts[0]
    last_name = "".join(parts[1:]) if len(parts) > 1 else ""
    email = normalize_email(email)
    user = get_user_by_email(db, email)
    if not user:
        user = User(
            email=email,
            password=get_password_hash(secrets.token_hex(8)),
            first_name=first_name,
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
    jwt_token = create_access_token({"sub": user.email}, expires)
    next_part = (
        next_url[len(settings.FRONTEND_URL.rstrip("/")) :]
        if next_url.startswith(settings.FRONTEND_URL)
        else next_url
    )
    login_redirect = (
        f"{settings.FRONTEND_URL.rstrip('/')}/login?token={jwt_token}"
        f"&next={quote(next_part, safe='')}"
    )
    return RedirectResponse(url=login_redirect)
