from fastapi import APIRouter, Response, HTTPException, Query, Request, Depends
from sqlalchemy.orm import Session
from io import BytesIO
import base64
import hashlib
from PIL import Image
from pathlib import Path
import os

from app.database import get_db
from app.models.service_provider_profile import ServiceProviderProfile as Artist
from app.utils.redis_cache import get_redis, cache_bytes, get_cached_bytes

# Locate backend/app/static from this file's position
STATIC_DIR = Path(__file__).resolve().parents[3] / "app" / "static"
PROFILE_PICS_DIR = STATIC_DIR / "profile_pics"


img_router = APIRouter(prefix="/img", tags=["images"])


def _decode_data_url(data_url: str) -> bytes:
    try:
        head, b64 = data_url.split("base64,", 1)
        return base64.b64decode(b64)
    except Exception:
        return b""


@img_router.get("/avatar/{artist_id}")
def avatar_thumb(
    request: Request,
    artist_id: int,
    w: int = Query(128, ge=16, le=512),
    db: Session = Depends(get_db),
):
    artist = db.query(Artist).filter(Artist.user_id == artist_id).first()
    if not artist or not artist.profile_picture_url:
        raise HTTPException(status_code=404, detail="No avatar")

    src = str(artist.profile_picture_url)
    raw = b""
    if src.startswith("data:"):
        raw = _decode_data_url(src)
    else:
        # Try to resolve local filesystem paths under static mounts
        try:
            path = src
            # Normalize storage-style or absolute static paths
            if path.startswith("/static/"):
                rel = path.replace("/static/", "", 1)
                fs_path = STATIC_DIR / rel
            elif path.startswith("/profile_pics/"):
                fs_path = PROFILE_PICS_DIR / path.replace("/profile_pics/", "", 1)
            elif path.startswith("profile_pics/"):
                fs_path = PROFILE_PICS_DIR / path.replace("profile_pics/", "", 1)
            else:
                fs_path = None
            if fs_path and fs_path.exists() and fs_path.is_file():
                raw = fs_path.read_bytes()
        except Exception:
            raw = b""

    if not raw:
        raise HTTPException(status_code=404, detail="Avatar unreadable")

    # Key includes artist, requested width, and content hash (so updates bust cache)
    content_hash = hashlib.sha256(raw).hexdigest()[:16]
    key = f"avatar:{artist_id}:{w}:{content_hash}"

    etag = f"W/\"{key}\""
    if request.headers.get("if-none-match") == etag:
        headers = {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            "ETag": etag,
        }
        return Response(status_code=304, headers=headers)

    cached = get_cached_bytes(key)
    if cached:
        headers = {
            "Content-Type": "image/webp",
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            "ETag": etag,
        }
        return Response(content=cached, headers=headers)

    img = Image.open(BytesIO(raw)).convert("RGB")
    img.thumbnail((w, w))
    out = BytesIO()
    img.save(out, format="WEBP", quality=70, method=6)
    blob = out.getvalue()

    try:
        r = get_redis()
    except Exception:
        r = None
    if r:
        cache_bytes(key, blob, 7 * 24 * 3600)

    headers = {
        "Content-Type": "image/webp",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "ETag": etag,
    }
    return Response(content=blob, headers=headers)
