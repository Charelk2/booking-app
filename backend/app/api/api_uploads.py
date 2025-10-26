import os
import uuid
import shutil
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .dependencies import get_current_user
from ..database import get_db
from ..utils import r2 as r2utils
from .dependencies import get_current_user
from ..models import user as models
from ..schemas.storage import PresignOut


router = APIRouter()

# Resolve static/portfolio_images directory relative to this file
THIS_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(THIS_DIR, "..", "static")
STATIC_DIR = os.path.abspath(STATIC_DIR)
PORTFOLIO_IMAGES_DIR = os.path.join(STATIC_DIR, "portfolio_images")
os.makedirs(PORTFOLIO_IMAGES_DIR, exist_ok=True)


@router.post("/uploads/images", status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),  # noqa: F401 (reserved for future auditing/logging)
    current_user=Depends(get_current_user),
):
    """
    Upload a generic image and return a static URL.

    Stores under /static/portfolio_images with a unique filename.
    Only image/* content types are accepted.
    """
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    ct = (file.content_type or "").lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")

    _, ext = os.path.splitext(file.filename or "")
    # Default extension based on content-type if missing
    if not ext:
        if ct == "image/png":
            ext = ".png"
        elif ct in ("image/jpeg", "image/jpg"):
            ext = ".jpg"
        elif ct == "image/webp":
            ext = ".webp"
        else:
            ext = ".jpg"

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(PORTFOLIO_IMAGES_DIR, unique_name)

    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        try:
            await file.close()
        except Exception:
            pass

    url = f"/static/portfolio_images/{unique_name}"
    return {"url": url}


@router.post("/services/media/presign")
async def presign_service_media(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),  # noqa: F401
    current_user=Depends(get_current_user),
):
    """Presign a direct R2 upload for service media images. Returns a PresignOut."""
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    ct = (file.content_type or "").lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")
    try:
        info = r2utils.presign_put_service_media(current_user.id, file.filename, file.content_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Presign failed: {exc}")
    return PresignOut(
        key=info.get("key") or "",
        put_url=info.get("put_url") or None,
        get_url=info.get("get_url") or None,
        public_url=info.get("public_url") or None,
        headers=info.get("headers") or {},
        upload_expires_in=int(info.get("upload_expires_in") or 0),
        download_expires_in=int(info.get("download_expires_in") or 0),
    )
