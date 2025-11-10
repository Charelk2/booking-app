from fastapi import APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks
from ..utils.json import dumps_bytes as _json_dumps
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional
import secrets
from pydantic import BaseModel, EmailStr
from jose import jwt, JWTError

from app.core.config import settings
from app.database import get_db
from app.models import User, UserType
from app.utils.auth import normalize_email, get_password_hash
from app.utils.email import send_email
from .auth import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    _create_refresh_token,
    _store_refresh_token,
    _set_access_cookie,
    _set_refresh_cookie,
)

router = APIRouter(tags=["auth"])


class MagicLinkRequest(BaseModel):
    email: EmailStr
    next: Optional[str] = None


class MagicLinkConsume(BaseModel):
    token: str


@router.post("/magic-link/request")
def request_magic_link(
    data: MagicLinkRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = normalize_email(data.email)
    # Do not leak user existence via errors
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        # Auto-provision minimal client account (pattern common with magic links)
        user = User(
            email=email,
            password=get_password_hash(secrets.token_hex(8)),
            first_name=email.split("@")[0],
            last_name="",
            user_type=UserType.CLIENT,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    exp = datetime.utcnow() + timedelta(minutes=15)
    payload = {"sub": user.email, "typ": "magic", "exp": exp}
    if data.next:
        payload["next"] = data.next
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    link = f"{settings.FRONTEND_URL.rstrip('/')}/magic?token={token}"

    try:
        background_tasks.add_task(
            send_email,
            user.email,
            "Your sign-in link",
            f"Click to sign in: {link}",
        )
    except Exception:
        # Non-fatal in dev; continue
        pass

    # In dev, surface the link
    if settings.EMAIL_DEV_MODE:
        return {"message": "Magic link generated.", "magic_link": link}
    return {"message": "If the account exists, a link was sent."}


@router.post("/magic-link/consume")
def consume_magic_link(data: MagicLinkConsume, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(data.token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("typ") != "magic":
            raise HTTPException(status_code=400, detail="Invalid token type")
        email = payload.get("sub")
        next_url = payload.get("next")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(func.lower(User.email) == normalize_email(email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access = jwt.encode({"sub": user.email, "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)}, SECRET_KEY, algorithm=ALGORITHM)
    refresh, r_exp = _create_refresh_token(user.email)
    _store_refresh_token(db, user, refresh, r_exp)
    resp = Response(content=_json_dumps({"ok": True, "next": next_url or settings.FRONTEND_URL}), media_type="application/json")
    _set_access_cookie(resp, access)
    _set_refresh_cookie(resp, refresh, r_exp)
    return resp
