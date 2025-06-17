# backend/app/api/auth.py

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import os
import logging
from dotenv import load_dotenv

from ..database import get_db
from ..models.user import User, UserType
from ..models.artist_profile_v2 import ArtistProfileV2 as ArtistProfile
from ..schemas.user import UserCreate, UserResponse, TokenData
from ..utils.auth import get_password_hash, verify_password

logger = logging.getLogger(__name__)

# Load environment variables from .env
load_dotenv()

router = APIRouter(tags=["auth"])

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "a_default_fallback_secret_key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# --- Login attempt tracking configuration ---
# Maximum failed attempts allowed within the window
MAX_LOGIN_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", 5))
# How long (seconds) each failed attempt counts against the limit
LOGIN_ATTEMPT_WINDOW_SECONDS = int(os.getenv("LOGIN_ATTEMPT_WINDOW_SECONDS", 600))
# How long (seconds) the account/IP pair is locked after exceeding the limit
LOCKOUT_DURATION_SECONDS = int(os.getenv("LOGIN_LOCKOUT_SECONDS", 900))

# Track failures and lockouts in-memory; a real deployment should use Redis or a persistent store
_failed_logins: dict[str, list[datetime]] = {}
_lockouts: dict[str, datetime] = {}


def _now() -> datetime:
    """Helper for easier monkeypatching in tests."""
    return datetime.utcnow()


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
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
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

        return db_user
    except Exception as e:
        db.rollback()
        logger.exception("Error during registration: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not register user"
        )


@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    host = request.client.host if request else "unknown"
    key = f"{form_data.username}:{host}"

    lock_until = _lockouts.get(key)
    now = _now()
    if lock_until and lock_until > now:
        logger.info("Login locked for %s from %s until %s", form_data.username, host, lock_until.isoformat())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please try again later.",
        )

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password):
        attempts = _failed_logins.get(key, [])
        attempts = [t for t in attempts if (now - t).total_seconds() <= LOGIN_ATTEMPT_WINDOW_SECONDS]
        attempts.append(now)
        _failed_logins[key] = attempts
        if len(attempts) >= MAX_LOGIN_ATTEMPTS:
            lock_until = now + timedelta(seconds=LOCKOUT_DURATION_SECONDS)
            _lockouts[key] = lock_until
            logger.warning(
                "User %s locked out from %s until %s", form_data.username, host, lock_until.isoformat()
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Account temporarily locked.",
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Successful login -> reset counters
    _failed_logins.pop(key, None)
    _lockouts.pop(key, None)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "user_type": user.user_type
        }
    }


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


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
