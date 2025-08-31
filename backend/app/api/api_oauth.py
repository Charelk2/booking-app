from fastapi import APIRouter, Request, Depends, status
from fastapi.responses import RedirectResponse, JSONResponse
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
from app.models import TrustedDevice

try:
    # Prefer google-auth for token verification
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
except Exception:  # pragma: no cover - optional import in some environments
    google_id_token = None
    google_requests = None

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

# Facebook OAuth (conditionally registered)
_facebook_client_id = getattr(settings, "FACEBOOK_CLIENT_ID", None)
_facebook_client_secret = getattr(settings, "FACEBOOK_CLIENT_SECRET", None)
if _facebook_client_id and _facebook_client_secret:
    oauth.register(
        name="facebook",
        client_id=_facebook_client_id,
        client_secret=_facebook_client_secret,
        authorize_url="https://www.facebook.com/v16.0/dialog/oauth",
        access_token_url="https://graph.facebook.com/v16.0/oauth/access_token",
        api_base_url="https://graph.facebook.com/v16.0/",
        client_kwargs={"scope": "email"},
    )
    try:
        logger.info("Facebook OAuth registered (client_id suffix=%s)", _facebook_client_id[-6:])
    except Exception:
        logger.info("Facebook OAuth registered")
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


@router.post("/google/onetap")
async def google_onetap(request: Request, db: Session = Depends(get_db)):
    """Verify a Google One Tap ID token and establish a session.

    Expects JSON body: {"credential": "<ID_TOKEN>", "next": "/dashboard", "deviceId": "..."}
    """
    body = await request.json()
    credential = (body or {}).get("credential")
    next_url = (body or {}).get("next") or settings.FRONTEND_URL.rstrip("/") + "/dashboard"
    device_id = (body or {}).get("deviceId")

    if not credential:
        raise error_response("Missing credential", {}, status.HTTP_400_BAD_REQUEST)

    # Determine allowed audience (client_id)
    audience = settings.GOOGLE_OAUTH_CLIENT_ID or settings.GOOGLE_CLIENT_ID
    # As a convenience for dev, allow NEXT_PUBLIC_GOOGLE_CLIENT_ID if others are empty
    if not audience:
        # Pull directly from env to avoid circular import concerns
        import os
        audience = os.getenv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "")
    if not audience:
        raise error_response("Google Client ID not configured", {}, status.HTTP_500_INTERNAL_SERVER_ERROR)

    payload = None
    # Verify using google-auth if available
    if google_id_token and google_requests:
        try:
            req = google_requests.Request()
            payload = google_id_token.verify_oauth2_token(credential, req, audience)
        except Exception as exc:  # pragma: no cover - depends on external certs/network
            logger.warning("Google One Tap verification failed: %s", exc)
            raise error_response("Invalid Google token", {}, status.HTTP_401_UNAUTHORIZED)
    else:  # pragma: no cover - fallback for environments without google-auth
        import jwt as pyjwt  # type: ignore
        try:
            # Decode without verification ONLY to extract claims; reject if aud doesn't match
            payload = pyjwt.decode(credential, options={"verify_signature": False, "verify_aud": False})
            aud = payload.get("aud")
            if isinstance(aud, (list, tuple)):
                ok = audience in aud
            else:
                ok = aud == audience
            if not ok:
                raise ValueError("audience mismatch")
        except Exception:
            raise error_response("Invalid Google token", {}, status.HTTP_401_UNAUTHORIZED)

    email = payload.get("email")
    if not email:
        raise error_response("Email not available from Google", {}, status.HTTP_400_BAD_REQUEST)
    first_name = payload.get("given_name") or ""
    last_name = payload.get("family_name") or ""

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

    # Optionally remember trusted device (skip MFA for password logins)
    resp = JSONResponse({"ok": True})
    if device_id and isinstance(device_id, str) and len(device_id) <= 255:
        try:
            existing = (
                db.query(TrustedDevice)
                .filter(TrustedDevice.user_id == user.id, TrustedDevice.device_id == device_id)
                .first()
            )
            from datetime import datetime, timedelta
            now = datetime.utcnow()
            exp = now + timedelta(days=30)
            if not existing:
                rec = TrustedDevice(user_id=user.id, device_id=device_id, last_seen_at=now, expires_at=exp)
                db.add(rec)
            else:
                existing.last_seen_at = now
                existing.expires_at = exp
            db.commit()
            # Also set a non-HttpOnly cookie with the device id for convenience (JS already stores it)
            resp.set_cookie(
                key="device_id",
                value=device_id,
                max_age=30 * 24 * 3600,
                httponly=False,
                secure=(settings.FRONTEND_URL.lower().startswith("https")),
                samesite="Lax",
                path="/",
            )
        except Exception:
            # Do not block login on device persistence errors
            db.rollback()

    # Issue session cookies
    expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token({"sub": user.email}, expires)
    refresh_token, r_exp = _create_refresh_token(user.email)
    _store_refresh_token(db, user, refresh_token, r_exp)
    _set_access_cookie(resp, access_token)
    _set_refresh_cookie(resp, refresh_token, r_exp)
    return resp


@router.get("/facebook/login")
async def facebook_login(
    request: Request,
    next: str = settings.FRONTEND_URL.rstrip("/") + "/dashboard",
):
    """Start Facebook OAuth flow."""
    if not hasattr(oauth, "facebook"):
        raise error_response(
            "Facebook OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    redirect_uri = request.url_for("facebook_callback")
    return await oauth.facebook.authorize_redirect(request, redirect_uri, state=next)


@router.get("/facebook/callback")
async def facebook_callback(request: Request, db: Session = Depends(get_db)):
    if not hasattr(oauth, "facebook"):
        raise error_response(
            "Facebook OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    next_url = request.query_params.get("state") or settings.FRONTEND_URL
    if next_url.startswith("/"):
        next_url = settings.FRONTEND_URL.rstrip("/") + next_url
    try:
        token = await oauth.facebook.authorize_access_token(request)
    except Exception as exc:
        logger.error("Facebook token exchange failed: %s", exc)
        raise error_response("Facebook authentication failed", {}, status.HTTP_400_BAD_REQUEST)

    # Fetch user profile
    email = None
    first_name = ""
    last_name = ""
    try:
        resp = await oauth.facebook.get("me?fields=id,name,email,first_name,last_name", token=token)
        if resp.status_code == 200:
            data = resp.json()
            email = data.get("email")
            first_name = data.get("first_name") or ""
            last_name = data.get("last_name") or ""
    except Exception as exc:
        logger.warning("Facebook profile fetch failed: %s", exc)

    if not email:
        # Facebook apps may not return email if permission not granted
        raise error_response("Email not available from Facebook", {}, status.HTTP_400_BAD_REQUEST)

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

    # Issue cookies and redirect
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
