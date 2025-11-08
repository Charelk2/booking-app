from fastapi import APIRouter, Request, Depends, status, HTTPException
from fastapi.responses import RedirectResponse
from fastapi import Response
from ..utils.json import dumps_bytes as _json_dumps
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from urllib.parse import urlencode, urlparse

from authlib.integrations.starlette_client import OAuth
import httpx

from app.auth.utils import new_oauth_state, sanitize_next, set_session_cookie
from app.core.config import (
    settings,
    FRONTEND_PRIMARY,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
)
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
from app.services.redis_client import redis

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

_STATE_TTL_SECONDS = 600
_STATE_KEY_PREFIX = "oauth:state:"
_NEXT_KEY_PREFIX = "oauth:next:"
_REDIS_STATE_PREFIX = "redis:"
_SIGNED_STATE_PREFIX = "sig:"


def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _normalize_next_path(next_path: str | None) -> str:
    sanitized = sanitize_next(next_path)
    if sanitized.startswith("/login"):
        return "/dashboard"
    return sanitized or "/"


def _encode_signed_state(next_path: str) -> str:
    payload = json.dumps(
        {
            "n": new_oauth_state(),
            "exp": int(time.time()) + _STATE_TTL_SECONDS,
            "next": next_path,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    secret = settings.SECRET_KEY.encode("utf-8")
    digest = hmac.new(secret, payload, hashlib.sha256).digest()
    token = f"{_SIGNED_STATE_PREFIX}{_b64_encode(payload)}.{_b64_encode(digest)}"
    return token


def _decode_signed_state(token: str) -> str:
    if not token.startswith(_SIGNED_STATE_PREFIX):
        raise ValueError("invalid_signed_state")
    try:
        encoded_payload, encoded_digest = token[len(_SIGNED_STATE_PREFIX) :].split(".", 1)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise ValueError("malformed_signed_state") from exc
    payload = _b64_decode(encoded_payload)
    provided_digest = _b64_decode(encoded_digest)
    secret = settings.SECRET_KEY.encode("utf-8")
    expected_digest = hmac.new(secret, payload, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_digest, provided_digest):
        raise ValueError("invalid_signature")
    try:
        data = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive guard
        raise ValueError("invalid_payload") from exc
    exp = data.get("exp")
    if isinstance(exp, int) and time.time() > exp:
        raise ValueError("state_expired")
    return _normalize_next_path(data.get("next"))


async def _issue_oauth_state(next_path: str) -> str:
    """Issue a signed, short‑lived state token.

    We bypass Redis entirely for state issuance to avoid infra coupling. The
    consumer still accepts legacy Redis states for backward compatibility.
    """
    sanitized = _normalize_next_path(next_path)
    return _encode_signed_state(sanitized)


async def _consume_oauth_state(state_token: str) -> str:
    if not state_token:
        raise ValueError("missing_state")
    if state_token.startswith(_SIGNED_STATE_PREFIX):
        return _decode_signed_state(state_token)
    if state_token.startswith(_REDIS_STATE_PREFIX):
        return await _consume_redis_state(state_token[len(_REDIS_STATE_PREFIX) :])
    # Backwards compatibility: plain Redis state without prefix
    return await _consume_redis_state(state_token)


async def _consume_redis_state(state_id: str) -> str:
    if not state_id:
        raise ValueError("invalid_state")
    try:
        exists = await redis.get(f"{_STATE_KEY_PREFIX}{state_id}")
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to read OAuth state: %s", exc)
        raise RuntimeError("oauth_state_lookup_failed") from exc
    if not exists:
        raise ValueError("invalid_or_expired_state")
    try:
        raw_next = await redis.get(f"{_NEXT_KEY_PREFIX}{state_id}")
    except Exception:
        raw_next = None
    try:
        await redis.delete(f"{_STATE_KEY_PREFIX}{state_id}", f"{_NEXT_KEY_PREFIX}{state_id}")
    except Exception:
        pass
    return _normalize_next_path(raw_next if isinstance(raw_next, str) else None)


def _login_redirect_uri(request: Request) -> str:
    """Derive the Google OAuth redirect URI for classic button flows."""
    fallback = "https://api.booka.co.za/auth/google/callback"
    try:
        configured = (getattr(settings, "GOOGLE_OAUTH_REDIRECT_URI", "") or "").strip()
        if configured:
            fallback = configured
    except Exception:  # pragma: no cover - defensive safeguard
        pass

    try:
        candidate = str(request.url_for("google_callback"))
    except Exception:  # pragma: no cover - defensive guard
        return fallback

    parsed = urlparse(candidate)
    host = (parsed.hostname or "").lower()
    forwarded_proto = (
        request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    )

    if parsed.scheme != "https" and forwarded_proto == "https":
        candidate = candidate.replace("http://", "https://", 1)
        parsed = urlparse(candidate)

    if parsed.scheme == "https" or host in {"localhost", "127.0.0.1"}:
        return candidate

    return fallback


async def _exchange_google_code_for_tokens(code: str, redirect_uri: str) -> dict:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise error_response(
            "Google OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    payload = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except Exception as exc:  # pragma: no cover - network failure
        logger.error("Google token request failed: %s", exc)
        raise error_response("Google authentication failed", {}, status.HTTP_400_BAD_REQUEST)

    if token_resp.status_code != 200:
        logger.error(
            "Google token exchange error: status=%s body=%s",
            token_resp.status_code,
            token_resp.text,
        )
        raise error_response("Google authentication failed", {}, status.HTTP_400_BAD_REQUEST)

    try:
        token_data = token_resp.json()
    except Exception:  # pragma: no cover - unexpected payload
        raise error_response("Invalid Google token response", {}, status.HTTP_400_BAD_REQUEST)

    if "access_token" not in token_data:
        raise error_response("Google token missing access_token", {}, status.HTTP_400_BAD_REQUEST)
    return token_data


async def _fetch_google_profile(request: Request, token_data: dict) -> dict:
    profile = None
    try:
        profile = await oauth.google.parse_id_token(request, token_data)
    except KeyError:
        profile = None
    except Exception as exc:  # pragma: no cover - parsing edge cases
        logger.warning("Failed to parse Google id_token: %s", exc)
        profile = None

    if profile:
        return profile

    access_token = token_data.get("access_token")
    if not access_token:
        return {}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except Exception as exc:  # pragma: no cover - network failure
        logger.error("Failed Google userinfo fetch: %s", exc)
        return {}

    if resp.status_code == 200:
        try:
            return resp.json()
        except Exception:
            return {}

    logger.error("Failed Google userinfo fetch: %s %s", resp.status_code, resp.text)
    return {}

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
async def google_login(request: Request, next: str = "/dashboard"):
    """Start Google OAuth flow without relying on browser session cookies."""
    if not hasattr(oauth, "google") or not GOOGLE_CLIENT_ID:
        raise error_response(
            "Google OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    state_token = await _issue_oauth_state(next)

    redirect_uri = _login_redirect_uri(request)

    params = {
        "response_type": "code",
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": "openid email profile",
        "state": state_token,
        "access_type": "online",
        "include_granted_scopes": "true",
    }
    prompt = request.query_params.get("prompt")
    if prompt:
        params["prompt"] = prompt
    else:
        params["prompt"] = "select_account"

    google_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=google_url, status_code=302)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    if not hasattr(oauth, "google") or not GOOGLE_CLIENT_ID:
        raise error_response(
            "Google OAuth not configured",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    state = request.query_params.get("state")
    if not state:
        return RedirectResponse(
            url=f"{FRONTEND_PRIMARY}/login?oauth_error=state",
            status_code=302,
        )

    try:
        next_path = await _consume_oauth_state(state)
    except ValueError:
        return RedirectResponse(
            url=f"{FRONTEND_PRIMARY}/login?oauth_error=state",
            status_code=302,
        )
    except RuntimeError:
        return RedirectResponse(
            url=f"{FRONTEND_PRIMARY}/login?oauth_error=state",
            status_code=302,
        )

    code = request.query_params.get("code")
    if not code:
        return RedirectResponse(
            url=f"{FRONTEND_PRIMARY}/login?oauth_error=code",
            status_code=302,
        )

    redirect_uri = _login_redirect_uri(request)

    try:
        token = await _exchange_google_code_for_tokens(code, redirect_uri)
    except HTTPException:
        return RedirectResponse(
            url=f"{FRONTEND_PRIMARY}/login?oauth_error=token",
            status_code=302,
        )
    profile = await _fetch_google_profile(request, token)
    if not profile:
        return RedirectResponse(
            url=f"{FRONTEND_PRIMARY}/login?oauth_error=profile",
            status_code=302,
        )

    email = profile.get("email")
    if not email:
        return RedirectResponse(
            url=f"{FRONTEND_PRIMARY}/login?oauth_error=email",
            status_code=302,
        )

    first_name = profile.get("given_name") or ""
    last_name = profile.get("family_name") or ""

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
    refresh_token, refresh_expires_at = _create_refresh_token(user.email)
    _store_refresh_token(db, user, refresh_token, refresh_expires_at)

    redirect_url = f"{FRONTEND_PRIMARY}{next_path}"
    response = RedirectResponse(url=redirect_url, status_code=302)
    access_max_age = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    set_session_cookie(response, "access_token", access_token, max_age=access_max_age)

    try:
        refresh_delta = int((refresh_expires_at - datetime.utcnow()).total_seconds())
    except Exception:
        refresh_delta = 30 * 24 * 3600
    refresh_max_age = max(refresh_delta, 60)
    set_session_cookie(response, "refresh_token", refresh_token, max_age=refresh_max_age)
    set_session_cookie(response, "session", access_token, max_age=access_max_age)
    return response


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
    resp = Response(content=_json_dumps({"ok": True}), media_type="application/json")
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
from ..utils.json import dumps_bytes as _json_dumps
