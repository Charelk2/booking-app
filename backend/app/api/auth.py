# backend/app/api/auth.py

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pathlib import Path
import base64
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional, Tuple
import os
import logging
import secrets
import hashlib
from dotenv import load_dotenv
from urllib.parse import urlparse

from ..database import get_db
from ..models.user import User, UserType
from ..models.trusted_device import TrustedDevice
from ..models.service_provider_profile import ServiceProviderProfile
from ..models.email_token import EmailToken
from ..schemas.user import (
    UserCreate,
    UserResponse,
    TokenData,
    MFAVerify,
    MFACode,
    EmailConfirmRequest,
)
from ..utils.auth import get_password_hash, verify_password, normalize_email
from ..utils.email import send_email
from ..utils.redis_cache import get_redis_client
from app.core.config import settings
import redis

try:
    import pyotp
except ModuleNotFoundError as exc:
    raise RuntimeError(
        "pyotp is required for multi-factor authentication. "
        "Run 'pip install -r backend/requirements.txt' to install dependencies."
    ) from exc

logger = logging.getLogger(__name__)

# Load environment variables from .env
load_dotenv()

router = APIRouter(tags=["auth"])

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "a_default_fallback_secret_key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 30))

# Login attempt throttling configured via settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _create_refresh_token(email: str) -> Tuple[str, datetime]:
    """Create a signed refresh token and its expiry."""
    expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    jti = secrets.token_urlsafe(16)
    token = jwt.encode({"sub": email, "typ": "refresh", "jti": jti, "exp": expires}, SECRET_KEY, algorithm=ALGORITHM)
    return token, expires


def _store_refresh_token(db: Session, user: User, token: str, exp: datetime) -> None:
    user.refresh_token_hash = _hash_token(token)
    user.refresh_token_expires_at = exp
    db.add(user)
    db.commit()
    db.refresh(user)


def _is_secure_cookie() -> bool:
    try:
        return settings.FRONTEND_URL.lower().startswith("https")
    except Exception:
        return False


def _compute_cookie_domain() -> str | None:
    configured = (getattr(settings, "COOKIE_DOMAIN", "") or "").strip()
    if configured:
        return configured

    def _candidate_to_domain(candidate: str) -> str | None:
        candidate = (candidate or '').strip()
        if not candidate:
            return None
        parsed = urlparse(candidate)
        host = (parsed.hostname or candidate).strip().lstrip('.').lower()
        if not host:
            return None
        if host in {"localhost", "127.0.0.1"} or host.endswith('.local'):
            return None
        if host.startswith('www.'):
            host = host[4:]
        if not host or '.' not in host:
            return None
        return f".{host}"

    try:
        direct = _candidate_to_domain(getattr(settings, "FRONTEND_URL", ""))
        if direct:
            return direct
    except Exception:
        pass

    try:
        for origin in getattr(settings, "CORS_ORIGINS", []) or []:
            domain = _candidate_to_domain(origin)
            if domain:
                return domain
    except Exception:
        pass

    return None


_AUTH_COOKIE_DOMAIN = _compute_cookie_domain()


def get_cookie_domain() -> str | None:
    return _AUTH_COOKIE_DOMAIN


def _set_access_cookie(response: Response, token: str, minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> None:
    max_age = minutes * 60
    cookie_domain = get_cookie_domain()
    secure = _is_secure_cookie()
    # Allow third‑party cookie usage in production: SameSite=None requires Secure
    same_site = "None" if secure else "Lax"
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite=same_site,
        max_age=max_age,
        path="/",
        domain=cookie_domain,
    )


def _set_refresh_cookie(response: Response, token: str, expires_at: datetime) -> None:
    # Compute max_age from expiry (fallback to configured days)
    try:
        delta = int((expires_at - datetime.utcnow()).total_seconds())
    except Exception:
        delta = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    cookie_domain = get_cookie_domain()
    secure = _is_secure_cookie()
    same_site = "None" if secure else "Lax"
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite=same_site,
        max_age=delta,
        path="/",
        domain=cookie_domain,
    )


def _clear_auth_cookies(response: Response) -> None:
    for k in ("access_token", "refresh_token"):
        response.set_cookie(
            key=k,
            value="",
            max_age=0,
            expires=0,
            path="/",
            httponly=True,
            secure=_is_secure_cookie(),
            samesite=("None" if _is_secure_cookie() else "Lax"),
            domain=get_cookie_domain(),
        )


@router.post("/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    email = normalize_email(user_data.email)
    existing_user = db.query(User).filter(func.lower(User.email) == email).first()
    if existing_user:
        # Use a precise, user-friendly message and 409 Conflict
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email already has an account. Sign in instead.",
        )

    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=email,
        password=hashed_password,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        phone_number=user_data.phone_number,
        user_type=user_data.user_type,
        # Service providers can skip email confirmation in this environment.
        is_verified=(user_data.user_type == UserType.SERVICE_PROVIDER),
    )

    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        if db_user.user_type == UserType.SERVICE_PROVIDER:
            # Create an empty service provider profile so the artist can
            # decide their categories later. No default services are added,
            # preventing accidental classification (e.g. as a photographer).
            service_provider_profile = ServiceProviderProfile(user_id=db_user.id)
            db.add(service_provider_profile)
            db.commit()
            db.refresh(service_provider_profile)
            return db_user

        token_value = secrets.token_urlsafe(32)
        expires = datetime.utcnow() + timedelta(hours=24)
        email_token = EmailToken(
            user_id=db_user.id,
            token=token_value,
            expires_at=expires,
        )
        db.add(email_token)
        db.commit()

        verify_link = f"{settings.FRONTEND_URL}/confirm-email?token={token_value}"
        send_email(
            db_user.email,
            "Confirm your email",
            f"Click the link to verify your account: {verify_link}",
        )

        return db_user
    except Exception as e:
        db.rollback()
        logger.exception("Error during registration: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not register user"
        )


# Login rate limiting and lockout are already implemented and tested in
# `test_login_lockout.py`.
@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else "unknown"
    email = normalize_email(form_data.username)
    user_key = f"login_fail:user:{email}"
    ip_key = f"login_fail:ip:{ip}"
    client = get_redis_client()
    try:
        user_attempts = int(client.get(user_key) or 0)
        ip_attempts = int(client.get(ip_key) or 0)
        if user_attempts >= settings.MAX_LOGIN_ATTEMPTS or ip_attempts >= settings.MAX_LOGIN_ATTEMPTS:
            logger.info("Login locked out for %s from %s", email, ip)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Try again later.",
            )
    except redis.exceptions.ConnectionError as exc:
        logger.warning("Redis unavailable for login tracking: %s", exc)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(form_data.password, user.password):
        try:
            client.incr(user_key)
            client.expire(user_key, settings.LOGIN_ATTEMPT_WINDOW)
            client.incr(ip_key)
            client.expire(ip_key, settings.LOGIN_ATTEMPT_WINDOW)
        except redis.exceptions.ConnectionError as exc:
            logger.warning("Could not update login attempt counters: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Skip MFA if a recognized trusted device is present
    device_id_hdr = request.headers.get("x-device-id") or request.headers.get("X-Device-Id")
    device_id_cookie = request.cookies.get("device_id")
    device_id = device_id_hdr or device_id_cookie
    trusted_ok = False
    if user.mfa_secret and device_id:
        try:
            from datetime import datetime
            rec = (
                db.query(TrustedDevice)
                .filter(TrustedDevice.user_id == user.id, TrustedDevice.device_id == device_id)
                .first()
            )
            if rec and rec.expires_at and rec.expires_at > datetime.utcnow():
                trusted_ok = True
                rec.last_seen_at = datetime.utcnow()
                db.add(rec)
                db.commit()
        except Exception:
            db.rollback()
            trusted_ok = False

    if user.mfa_secret and not trusted_ok:
        temp_token = create_access_token(
            {"sub": user.email, "mfa": True},
            expires_delta=timedelta(minutes=5),
        )
        try:
            from ..utils.notifications import _send_sms
            code = pyotp.TOTP(user.mfa_secret).now()
            _send_sms(user.phone_number, f"Your verification code is {code}")
        except Exception as exc:  # pragma: no cover - SMS failures shouldn't crash
            logger.warning("Unable to send MFA code: %s", exc)
        return {"mfa_required": True, "mfa_token": temp_token}

    try:
        client.delete(user_key)
        client.delete(ip_key)
    except redis.exceptions.ConnectionError as exc:
        logger.warning("Could not reset login counters: %s", exc)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=access_token_expires,
    )

    refresh_token, r_exp = _create_refresh_token(user.email)
    _store_refresh_token(db, user, refresh_token, r_exp)

    # Set HttpOnly cookies for access + refresh, but still return JSON for compatibility
    payload = {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "user_type": user.user_type,
            "mfa_enabled": bool(user.mfa_secret),
        },
        "refresh_token": refresh_token,
    }
    resp = JSONResponse(payload)
    _set_access_cookie(resp, access_token)
    _set_refresh_cookie(resp, refresh_token, r_exp)
    return resp


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    email = normalize_email(email)
    return db.query(User).filter(func.lower(User.email) == email).first()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    request: Request = None,
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Prefer Authorization header; fall back to access_token cookie if missing
    jwt_token = token
    if (not jwt_token) and request is not None:
        jwt_token = request.cookies.get("access_token")
    if not jwt_token:
        raise credentials_exception
    try:
        payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception

    user = get_user_by_email(db, token_data.email)
    if user is None:
        raise credentials_exception
    return user


@router.post("/verify-mfa")
def verify_mfa(data: MFAVerify, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(data.token, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("mfa"):
            raise HTTPException(status_code=400, detail="Invalid token")
        email = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = get_user_by_email(db, email)
    if not user or not user.mfa_secret:
        raise HTTPException(status_code=401, detail="User not found")

    if not pyotp.TOTP(user.mfa_secret).verify(data.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    user.mfa_enabled = True
    db.commit()

    # Optionally mark this device as trusted for 30 days
    device_cookie_value: str | None = None
    try:
        if getattr(data, "trustedDevice", None) and getattr(data, "deviceId", None):
            from datetime import datetime, timedelta
            now = datetime.utcnow()
            exp = now + timedelta(days=30)
            existing = (
                db.query(TrustedDevice)
                .filter(TrustedDevice.user_id == user.id, TrustedDevice.device_id == data.deviceId)
                .first()
            )
            if not existing:
                rec = TrustedDevice(user_id=user.id, device_id=data.deviceId, last_seen_at=now, expires_at=exp)
                db.add(rec)
            else:
                existing.last_seen_at = now
                existing.expires_at = exp
            db.commit()
            device_cookie_value = data.deviceId
    except Exception:
        db.rollback()

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=access_token_expires,
    )
    refresh_token, r_exp = _create_refresh_token(user.email)
    _store_refresh_token(db, user, refresh_token, r_exp)
    payload = {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "user_type": user.user_type,
            "mfa_enabled": True,
        },
        "refresh_token": refresh_token,
    }
    resp = JSONResponse(payload)
    _set_access_cookie(resp, access_token)
    _set_refresh_cookie(resp, refresh_token, r_exp)
    # Set non-HttpOnly device cookie to help future requests include device id even without JS
    if device_cookie_value:
        resp.set_cookie(
            key="device_id",
            value=device_cookie_value,
            max_age=30 * 24 * 3600,
            httponly=False,
            secure=_is_secure_cookie(),
            samesite="Lax",
            path="/",
        )
    return resp


@router.post("/setup-mfa")
def setup_mfa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    secret = pyotp.random_base32()
    current_user.mfa_secret = secret
    db.commit()
    return {
        "secret": secret,
        "otp_auth_url": pyotp.totp.TOTP(secret).provisioning_uri(
            current_user.email,
            issuer_name="BookingApp",
        ),
    }


@router.post("/confirm-mfa")
def confirm_mfa(
    data: MFACode,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not initialized")
    if not pyotp.TOTP(current_user.mfa_secret).verify(data.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid MFA code")
    current_user.mfa_enabled = True
    db.commit()
    return {"message": "MFA enabled"}


@router.post("/recovery-codes")
def generate_recovery_codes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not enabled")
    codes = [secrets.token_hex(8) for _ in range(8)]
    hashed = [hashlib.sha256(c.encode()).hexdigest() for c in codes]
    current_user.mfa_recovery_tokens = ",".join(hashed)
    db.commit()
    return {"codes": codes}


@router.post("/disable-mfa")
def disable_mfa(
    data: MFACode,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not enabled")

    valid = pyotp.TOTP(current_user.mfa_secret).verify(data.code, valid_window=1)
    if not valid and current_user.mfa_recovery_tokens:
        hashed = hashlib.sha256(data.code.encode()).hexdigest()
        tokens = current_user.mfa_recovery_tokens.split(",")
        if hashed in tokens:
            tokens.remove(hashed)
            current_user.mfa_recovery_tokens = ",".join(tokens)
            valid = True
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    current_user.mfa_secret = None
    current_user.mfa_enabled = False
    current_user.mfa_recovery_tokens = None
    db.commit()
    return {"message": "MFA disabled"}


@router.post("/confirm-email")
def confirm_email(data: EmailConfirmRequest, db: Session = Depends(get_db)):
    record = db.query(EmailToken).filter(EmailToken.token == data.token).first()
    if not record or record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_verified = True
    db.delete(record)
    db.commit()
    return {"message": "Email confirmed"}


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return details for the authenticated user.

    Opportunistically migrate legacy file-based profile pictures to data URLs
    so avatars survive redeploys.
    """
    try:
        url = getattr(current_user, 'profile_picture_url', None)
        if isinstance(url, str) and url.startswith('/static/'):
            static_dir = Path(__file__).resolve().parent.parent / 'static'
            rel = url.replace('/static/', '', 1)
            fs_path = static_dir / rel
            if fs_path.exists() and fs_path.is_file():
                mime = 'image/jpeg'
                ext = fs_path.suffix.lower()
                if ext == '.png':
                    mime = 'image/png'
                elif ext == '.webp':
                    mime = 'image/webp'
                elif ext == '.svg':
                    mime = 'image/svg+xml'
                try:
                    data = fs_path.read_bytes()
                    b64 = base64.b64encode(data).decode('ascii')
                    current_user.profile_picture_url = f'data:{mime};base64,{b64}'
                    db.add(current_user)
                    db.commit()
                    db.refresh(current_user)
                except Exception:
                    pass
    except Exception:
        pass
    return current_user


@router.get("/email-status")
def email_status(
    request: Request,
    email: str,
    db: Session = Depends(get_db),
):
    """Lightweight existence check for an email address.

    Returns a minimal payload used by the email-first signup flow to branch the UI
    before showing the full registration form.

    Example response:
    {"exists": true, "providers": ["password", "google", "apple"], "locked": false}
    """
    norm = normalize_email(email)
    user = db.query(User).filter(func.lower(User.email) == norm).first()

    # Determine supported providers — password is always supported. OAuth providers
    # are included when configured so the UI can surface the relevant CTAs.
    providers = ["password"]
    try:
        # Reuse the same env-driven checks as OAuth registration
        from app.core.config import settings as _settings
        if (_settings.GOOGLE_OAUTH_CLIENT_ID or _settings.GOOGLE_CLIENT_ID):
            providers.append("google")
        if (
            getattr(_settings, "APPLE_CLIENT_ID", None)
            and getattr(_settings, "APPLE_TEAM_ID", None)
            and getattr(_settings, "APPLE_KEY_ID", None)
            and getattr(_settings, "APPLE_PRIVATE_KEY", None)
        ):
            providers.append("apple")
    except Exception:
        # Best-effort; never fail this lightweight endpoint due to config lookups
        pass

    # Check if login is temporarily locked due to failed attempts
    locked = False
    try:
        client = get_redis_client()
        ip = request.client.host if request.client else "unknown"
        user_key = f"login_fail:user:{norm}"
        ip_key = f"login_fail:ip:{ip}"
        user_attempts = int(client.get(user_key) or 0)
        ip_attempts = int(client.get(ip_key) or 0)
        from app.core.config import settings as _s
        threshold = _s.MAX_LOGIN_ATTEMPTS
        locked = user_attempts >= threshold or ip_attempts >= threshold
    except Exception:
        locked = False

    return {
        "exists": bool(user),
        "providers": providers,
        "locked": locked,
    }


@router.post("/refresh")
def refresh_token(
    *,
    token: str = None,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Rotate refresh token and issue a new access token to prevent logouts.

    Accepts a refresh ``token`` (body form or JSON). Verifies signature and
    expiry, compares hash to the stored hash on the user, rotates to a fresh
    refresh token, and returns both tokens.
    """
    # Allow refresh via body token or cookie
    refresh_jwt = token or (request.cookies.get("refresh_token") if request else None)
    if not refresh_jwt:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    try:
        payload = jwt.decode(refresh_jwt, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("typ") != "refresh":
            raise HTTPException(status_code=400, detail="Invalid token type")
        email = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = get_user_by_email(db, email)
    if not user or not user.refresh_token_hash:
        raise HTTPException(status_code=401, detail="Session expired")
    if user.refresh_token_expires_at and user.refresh_token_expires_at < datetime.utcnow():
        # Expired in DB
        user.refresh_token_hash = None
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    provided_hash = _hash_token(refresh_jwt)
    if provided_hash != user.refresh_token_hash:
        # Idempotent refresh window: accept a duplicate refresh using the previous token
        try:
            client = get_redis_client()
            # Map from previous hash -> latest refresh token (plaintext) for a short grace window
            key = f"auth:refresh:prev:{provided_hash}"
            mapped = client.get(key)
            if mapped:
                # Issue a fresh access token and set the current refresh cookie to the latest value
                access = create_access_token({"sub": email}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
                payload = {"access_token": access, "token_type": "bearer", "refresh_token": mapped}
                resp = JSONResponse(payload)
                _set_access_cookie(resp, access)
                # Use DB expiry; if missing, default to configured days
                exp = user.refresh_token_expires_at or (datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
                _set_refresh_cookie(resp, mapped, exp)
                return resp
        except Exception:
            pass
        # Outside grace window or no mapping: treat as rotated/expired
        raise HTTPException(status_code=401, detail="Token has been rotated")

    # Rotate refresh token
    new_refresh, r_exp = _create_refresh_token(email)
    # Store a grace mapping from the previous valid hash to the newly rotated token
    try:
        prev_hash = provided_hash
        client = get_redis_client()
        if isinstance(client, redis.Redis):
            client.setex(f"auth:refresh:prev:{prev_hash}", 60, new_refresh)
    except Exception:
        pass
    _store_refresh_token(db, user, new_refresh, r_exp)

    # Issue a fresh access token
    access = create_access_token({"sub": email}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {"access_token": access, "token_type": "bearer", "refresh_token": new_refresh}
    resp = JSONResponse(payload)
    _set_access_cookie(resp, access)
    _set_refresh_cookie(resp, new_refresh, r_exp)
    return resp


@router.post("/logout")
def logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invalidate the current session's refresh token."""
    current_user.refresh_token_hash = None
    current_user.refresh_token_expires_at = None
    db.commit()
    resp = JSONResponse({"message": "logged out"})
    _clear_auth_cookies(resp)
    return resp


# ─── Password reset (JWT-based, no DB migration required) ─────────────────────────
from pydantic import BaseModel, EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    user = db.query(User).filter(func.lower(User.email) == email).first()
    # Respond 200 regardless to avoid account enumeration; only send email if user exists
    reset_link = None
    if user:
        reset_exp = datetime.utcnow() + timedelta(hours=1)
        reset_token = jwt.encode(
            {"sub": user.email, "typ": "pwd_reset", "exp": reset_exp}, SECRET_KEY, algorithm=ALGORITHM
        )
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
        try:
            send_email(user.email, "Reset your password", f"Click the link to reset your password: {reset_link}")
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to send reset email: %s", exc)
    # In dev mode, surface the link to the client to ease testing
    if settings.EMAIL_DEV_MODE and reset_link:
        logger.info("Password reset link for %s: %s", email, reset_link)
        return {"message": "Reset link generated.", "reset_link": reset_link}
    return {"message": "If the account exists, a reset link was sent."}


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(data.token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("typ") != "pwd_reset":
            raise HTTPException(status_code=400, detail="Invalid token type")
        email = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = get_user_by_email(db, email)
    if not user:
        # Treat as expired/invalid to avoid user enumeration details
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user.password = get_password_hash(data.password)
    # Invalidate existing refresh token
    user.refresh_token_hash = None
    user.refresh_token_expires_at = None
    db.commit()
    return {"message": "Password has been reset"}
