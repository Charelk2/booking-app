# backend/app/api/auth.py

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional
import os
import logging
import secrets
import hashlib
from dotenv import load_dotenv

from ..database import get_db
from ..models.user import User, UserType
from ..models.artist_profile_v2 import ArtistProfileV2 as ArtistProfile
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

# Login attempt throttling configured via settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    email = normalize_email(user_data.email)
    existing_user = db.query(User).filter(func.lower(User.email) == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=email,
        password=hashed_password,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        phone_number=user_data.phone_number,
        user_type=user_data.user_type
    )

    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        if db_user.user_type == UserType.ARTIST:
            artist_profile = ArtistProfile(user_id=db_user.id)
            db.add(artist_profile)
            db.commit()

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

    if user.mfa_secret:
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

    return {
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
    }


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    email = normalize_email(email)
    return db.query(User).filter(func.lower(User.email) == email).first()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=access_token_expires,
    )
    return {
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
    }


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
def read_current_user(current_user: User = Depends(get_current_user)):
    """Return details for the authenticated user."""
    return current_user


