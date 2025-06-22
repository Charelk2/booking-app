from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta
import secrets
import logging

from authlib.integrations.starlette_client import OAuth

from app.core.config import settings
from app.database import get_db
from app.models import User, UserType
from app.api.auth import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from app.utils.auth import get_password_hash, normalize_email

router = APIRouter()

logger = logging.getLogger(__name__)

oauth = OAuth()

if settings.GOOGLE_OAUTH_CLIENT_ID:
    oauth.register(
        name="google",
        client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
        client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        api_base_url="https://openidconnect.googleapis.com/v1/",
        client_kwargs={"scope": "openid email profile"},
    )

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
    if not hasattr(oauth, 'google'):
        raise HTTPException(500, "Google OAuth not configured")
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri, state=next)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    if not hasattr(oauth, 'google'):
        raise HTTPException(500, "Google OAuth not configured")
    next_url = request.query_params.get("state") or settings.FRONTEND_URL
    if next_url.startswith("/"):
        next_url = settings.FRONTEND_URL.rstrip("/") + next_url
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:  # pragma: no cover - network/token errors
        logger.error("Google token exchange failed: %s", exc)
        raise HTTPException(status_code=400, detail="Google authentication failed")

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
            raise HTTPException(status_code=400, detail="Failed to fetch Google profile")
    if not profile:
        raise HTTPException(status_code=400, detail="Failed to fetch Google profile")
    email = profile.get("email")
    if not email:
        raise HTTPException(400, "Email not available from Google")
    first_name = profile.get("given_name") or ""
    last_name = profile.get("family_name") or ""

    email = normalize_email(email)
    user = db.query(User).filter(func.lower(User.email) == email).first()
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
    redirect = f"{next_url}?token={jwt_token}"
    return RedirectResponse(url=redirect)


@router.get("/github/login")
async def github_login(
    request: Request,
    next: str = settings.FRONTEND_URL.rstrip("/") + "/dashboard",
):
    """Start GitHub OAuth flow."""
    if not hasattr(oauth, 'github'):
        raise HTTPException(500, "GitHub OAuth not configured")
    redirect_uri = request.url_for("github_callback")
    return await oauth.github.authorize_redirect(request, redirect_uri, state=next)


@router.get("/github/callback")
async def github_callback(request: Request, db: Session = Depends(get_db)):
    if not hasattr(oauth, 'github'):
        raise HTTPException(500, "GitHub OAuth not configured")
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
        raise HTTPException(400, "Email not available from GitHub")
    name = profile.get("name") or profile.get("login")
    parts = name.split()
    first_name = parts[0]
    last_name = "".join(parts[1:]) if len(parts) > 1 else ""
    email = normalize_email(email)
    user = db.query(User).filter(func.lower(User.email) == email).first()
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
    redirect = f"{next_url}?token={jwt_token}"
    return RedirectResponse(url=redirect)
