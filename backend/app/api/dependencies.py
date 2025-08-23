from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from jose import JWTError, jwt

from ..database import SessionLocal, get_db
from ..models.user import User, UserType
from .auth import oauth2_scheme, SECRET_KEY, ALGORITHM, get_user_by_email
from ..utils.auth import normalize_email

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db), request: Request = None) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    jwt_token = token or (request.cookies.get("access_token") if request else None)
    try:
        payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    # Eager load artist_profile if it exists, to potentially save queries in dependent functions
    user = db.query(User).options(joinedload(User.artist_profile)).filter(
        func.lower(User.email) == normalize_email(email)
    ).first()
    if user is None:
        raise credentials_exception
    return user

def get_current_active_client(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    # Any active user can be a client for actions like creating a booking
    return current_user

def get_current_service_provider(current_user: User = Depends(get_current_user)) -> User:
    """Ensure the current user is an active service provider."""

    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    if current_user.user_type != UserType.SERVICE_PROVIDER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a service provider.",
        )

    # get_current_user should have eager-loaded artist_profile.
    # If user_type is SERVICE_PROVIDER, they must have an associated profile.
    if not current_user.artist_profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Artist profile does not exist. Please create one.",
        )
    return current_user
