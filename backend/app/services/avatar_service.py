import logging
import os
import uuid
from pathlib import Path
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.models import User
from app.utils import r2 as r2utils

logger = logging.getLogger(__name__)

# Resolve backend/app/static directory relative to this file
STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
PROFILE_PICS_DIR = STATIC_DIR / "profile_pics"
PROFILE_PICS_DIR.mkdir(parents=True, exist_ok=True)

# Max avatar size (bytes) for both manual uploads and Google sync.
_DEFAULT_MAX_BYTES = 2_000_000  # 2 MB
MAX_AVATAR_BYTES = int(os.getenv("USER_AVATAR_MAX_BYTES", str(_DEFAULT_MAX_BYTES)) or _DEFAULT_MAX_BYTES)

# Google avatar fetch safety knobs (env-driven; keep lightweight).
GOOGLE_AVATAR_SYNC_ENABLED = (os.getenv("GOOGLE_AVATAR_SYNC_ENABLED", "1") or "1") not in {"0", "false", "False"}
GOOGLE_AVATAR_TIMEOUT_SECONDS = float(os.getenv("GOOGLE_AVATAR_HTTP_TIMEOUT_SECONDS", "2.5") or "2.5")
GOOGLE_AVATAR_MAX_BYTES = int(os.getenv("GOOGLE_AVATAR_MAX_BYTES", str(MAX_AVATAR_BYTES)) or MAX_AVATAR_BYTES)
GOOGLE_AVATAR_STRICT_HOST = (os.getenv("GOOGLE_AVATAR_STRICT_HOST", "1") or "1") not in {"0", "false", "False"}

_GOOGLE_AVATAR_HOSTS = (
    "googleusercontent.com",
    "ggpht.com",
)


def _delete_static_avatar(url: str) -> None:
    """Best-effort removal of a previous static avatar file.

    Only touches files under backend/app/static/profile_pics to avoid surprises.
    """
    try:
        rel: Optional[str] = None
        if url.startswith("/static/"):
            rel = url.replace("/static/", "", 1)
        elif url.startswith("/profile_pics/"):
            rel = f"profile_pics/{url.replace('/profile_pics/', '', 1)}"
        elif url.startswith("profile_pics/"):
            rel = url
        if not rel:
            return
        fs_path = STATIC_DIR / rel
        if fs_path.exists() and fs_path.is_file():
            try:
                fs_path.unlink()
            except OSError as exc:
                logger.warning("Failed to delete old avatar file %s: %s", fs_path, exc)
    except Exception:
        # Never block avatar updates on cleanup errors
        return


def _guess_static_ext(content_type: Optional[str], filename: Optional[str]) -> str:
    """Choose a reasonable extension for static avatar files."""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].strip().lower()
        if ext:
            return "." + ext
    ct = (content_type or "").lower()
    if ct == "image/png":
        return ".png"
    if ct in ("image/jpeg", "image/jpg"):
        return ".jpg"
    if ct == "image/webp":
        return ".webp"
    if ct == "image/gif":
        return ".gif"
    if ct == "image/avif":
        return ".avif"
    return ".jpg"


def save_user_avatar_bytes(
    db: Session,
    user: User,
    data: bytes,
    content_type: Optional[str],
    filename: Optional[str] = None,
) -> str:
    """Store avatar bytes for a user in R2 when configured, otherwise local static files.

    Returns the URL that was written to ``user.profile_picture_url`` but does not commit.
    Callers are responsible for committing the transaction.
    """
    if not isinstance(data, (bytes, bytearray)):
        raise ValueError("avatar data must be bytes")
    if MAX_AVATAR_BYTES and len(data) > MAX_AVATAR_BYTES:
        raise ValueError(f"avatar too large (max {MAX_AVATAR_BYTES} bytes)")

    old_url = getattr(user, "profile_picture_url", None)
    avatar_url: Optional[str] = None
    ct = (content_type or "image/jpeg").split(";")[0].strip().lower()

    # Prefer R2 when configured; fall back to static files on any failure.
    try:
        cfg = r2utils.R2Config()
        if cfg.is_configured():
            # Reuse the avatar key pattern used by presign_put_avatar for consistency.
            try:
                key = r2utils._build_avatar_key(int(user.id), filename, ct)  # type: ignore[attr-defined]
            except Exception:
                # Fallback: simple avatars/{user_id}/{uuid} naming if helper changes
                uid = uuid.uuid4().hex
                ext = r2utils.guess_extension(filename, ct) or _guess_static_ext(ct, filename)
                key = f"avatars/{int(user.id)}/{uid}{ext}"
            avatar_url = r2utils.put_bytes(key, data, content_type=ct)
    except Exception as exc:
        logger.warning("R2 avatar upload failed for user_id=%s: %s", getattr(user, "id", None), exc)
        avatar_url = None

    if not avatar_url:
        # Local static fallback under /static/profile_pics
        ext = _guess_static_ext(ct, filename)
        name = f"{uuid.uuid4().hex}{ext}"
        fs_path = PROFILE_PICS_DIR / name
        try:
            fs_path.write_bytes(data)
        except Exception as exc:
            logger.error("Failed to write avatar file %s: %s", fs_path, exc)
            raise
        avatar_url = f"/static/profile_pics/{name}"

    # Clean up previous static file if applicable (R2 cleanup is intentionally best-effort/no-op here).
    if isinstance(old_url, str):
        _delete_static_avatar(old_url)

    user.profile_picture_url = avatar_url
    db.add(user)
    return avatar_url


async def sync_google_avatar_from_url(
    db: Session,
    user: User,
    picture_url: Optional[str],
) -> None:
    """Best-effort avatar sync from Google's ``picture`` URL.

    - No-op when disabled via env, when picture_url is missing, or when the user already has an avatar.
    - Enforces HTTPS + host allowlist when GOOGLE_AVATAR_STRICT_HOST is enabled.
    - Enforces a max size and short timeout.
    - Never raises to the caller; logs and returns on failure.
    """
    if not GOOGLE_AVATAR_SYNC_ENABLED:
        return
    if not picture_url:
        return

    # Do not override an existing avatar chosen or uploaded by the user.
    try:
        if getattr(user, "profile_picture_url", None):
            return
    except Exception:
        return

    # Basic URL validation + host guard
    try:
        from urllib.parse import urlparse

        parsed = urlparse(str(picture_url))
    except Exception:
        return

    if GOOGLE_AVATAR_STRICT_HOST:
        scheme = (parsed.scheme or "").lower()
        host = (parsed.hostname or "").lower()
        if scheme != "https" or not host:
            return
        if not any(host == h or host.endswith("." + h) for h in _GOOGLE_AVATAR_HOSTS):
            # Ignore non-Google picture URLs to avoid SSRF surprises
            return

    try:
        async with httpx.AsyncClient(timeout=GOOGLE_AVATAR_TIMEOUT_SECONDS) as client:
            resp = await client.get(str(picture_url))
    except Exception as exc:
        logger.warning("google_avatar_fetch_failed user_id=%s error=%s", getattr(user, "id", None), exc)
        return

    if resp.status_code != 200:
        logger.warning(
            "google_avatar_fetch_status user_id=%s status=%s",
            getattr(user, "id", None),
            resp.status_code,
        )
        return

    ct = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if not ct.startswith("image/"):
        return
    data = resp.content or b""
    if GOOGLE_AVATAR_MAX_BYTES and len(data) > GOOGLE_AVATAR_MAX_BYTES:
        logger.warning(
            "google_avatar_too_large user_id=%s size=%s max=%s",
            getattr(user, "id", None),
            len(data),
            GOOGLE_AVATAR_MAX_BYTES,
        )
        return

    # Store using the same pipeline as manual uploads. Never let failures bubble into OAuth flows.
    try:
        save_user_avatar_bytes(db, user, data, ct, filename=None)
        db.commit()
        db.refresh(user)
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning("google_avatar_save_failed user_id=%s error=%s", getattr(user, "id", None), exc)
        return

