from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.ops_scheduler import run_maintenance
from .. import models
from sqlalchemy import update
from sqlalchemy.sql import text
import base64
import os
import re

from ..models.service import Service
from ..models.user import User
from ..models.service_provider_profile import ServiceProviderProfile


router = APIRouter(tags=["ops"])


@router.post("/ops/scheduler/tick", status_code=status.HTTP_202_ACCEPTED)
def ops_tick(db: Session = Depends(get_db)):
    """Run maintenance tasks once and return a summary.

    Useful for manual testing or external cron when background tasks are disabled.
    """
    summary = run_maintenance(db)
    return {"status": "ok", **summary}


@router.post("/ops/migrate-notification-links-booka")
def migrate_booka_links(db: Session = Depends(get_db)):
    """One-off migration: rewrite moderation NEW_MESSAGE links to use /inbox?booka=1.

    Idempotent: runs UPDATE on matching rows only.
    """
    try:
        # Only affect NEW_MESSAGE notifications that look like Booka moderation updates
        # and currently point at /inbox?requestId=...
        q = db.query(models.Notification).filter(
            models.Notification.type == models.NotificationType.NEW_MESSAGE,
            models.Notification.link.like("%/inbox?requestId=%"),
        )
        rows = q.all()
        updated = 0
        for n in rows:
            msg = (n.message or "").lower()
            if "listing approved:" in msg or "listing rejected:" in msg or "new message from booka" in msg:
                n.link = "/inbox?booka=1"
                db.add(n)
                updated += 1
        if updated:
            db.commit()
        return {"updated": updated}
    except Exception as exc:
        db.rollback()
        return {"updated": 0, "error": str(exc)}


@router.post("/ops/migrate-service-media-to-files")
def migrate_service_media_to_files(db: Session = Depends(get_db)):
    """Migrate Service.media_url data: URLs to static file URLs.

    - Finds services where media_url starts with 'data:'
    - Decodes and writes to backend/app/static/portfolio_images/<uuid>.ext
    - Updates media_url to '/static/portfolio_images/<uuid>.ext'
    Idempotent: skips services that already point to /static/...
    """
    STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
    PORTFOLIO_IMAGES_DIR = os.path.join(STATIC_DIR, "portfolio_images")
    os.makedirs(PORTFOLIO_IMAGES_DIR, exist_ok=True)

    q = db.query(Service).filter(Service.media_url.like("data:%"))
    rows = q.all()
    migrated = 0
    failed = 0
    for s in rows:
        data_url = s.media_url or ""
        try:
            m = re.match(r"^data:([^;]+);base64,(.*)$", data_url)
            if not m:
                failed += 1
                continue
            mime = (m.group(1) or "image/jpeg").lower()
            b64 = m.group(2)
            data = base64.b64decode(b64)
            # Choose extension
            ext = ".jpg"
            if mime == "image/png":
                ext = ".png"
            elif mime in ("image/jpeg", "image/jpg"):
                ext = ".jpg"
            elif mime == "image/webp":
                ext = ".webp"
            # Write file
            import uuid

            name = f"{uuid.uuid4().hex}{ext}"
            path = os.path.join(PORTFOLIO_IMAGES_DIR, name)
            with open(path, "wb") as f:
                f.write(data)
            s.media_url = f"/static/portfolio_images/{name}"
            db.add(s)
            migrated += 1
        except Exception:
            failed += 1
    if migrated:
        db.commit()
    return {"found": len(rows), "migrated": migrated, "failed": failed}


@router.post("/ops/migrate-profile-images-to-files")
def migrate_profile_images_to_files(db: Session = Depends(get_db)):
    """Migrate data: URLs in user and artist profiles to static files.

    - users.profile_picture_url → /static/profile_pics
    - service_provider_profiles.profile_picture_url → /static/profile_pics
    - service_provider_profiles.cover_photo_url → /static/cover_photos
    - service_provider_profiles.portfolio_image_urls[] → /static/portfolio_images
    """
    BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
    PROFILE_PICS_DIR = os.path.join(BASE, "profile_pics")
    COVER_DIR = os.path.join(BASE, "cover_photos")
    PORTFOLIO_DIR = os.path.join(BASE, "portfolio_images")
    for d in (PROFILE_PICS_DIR, COVER_DIR, PORTFOLIO_DIR):
        os.makedirs(d, exist_ok=True)

    def write_data_url(data_url: str, target_dir: str) -> str | None:
        m = re.match(r"^data:([^;]+);base64,(.*)$", data_url)
        if not m:
            return None
        mime = (m.group(1) or "image/jpeg").lower()
        b64 = m.group(2)
        data = base64.b64decode(b64)
        ext = ".jpg"
        if mime == "image/png":
            ext = ".png"
        elif mime in ("image/jpeg", "image/jpg"):
            ext = ".jpg"
        elif mime == "image/webp":
            ext = ".webp"
        import uuid

        name = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(target_dir, name)
        with open(path, "wb") as f:
            f.write(data)
        # Return URL path under /static
        rel = os.path.relpath(path, BASE)
        return f"/static/{rel.replace(os.path.sep, '/')}"

    results = {
        "users": {"found": 0, "migrated": 0, "failed": 0},
        "artist_profile_pics": {"found": 0, "migrated": 0, "failed": 0},
        "artist_cover_photos": {"found": 0, "migrated": 0, "failed": 0},
        "artist_portfolio_images": {"found": 0, "migrated": 0, "failed": 0},
    }

    # Users
    users = db.query(User).filter(User.profile_picture_url.like("data:%")).all()
    results["users"]["found"] = len(users)
    for u in users:
        try:
            url = write_data_url(u.profile_picture_url or "", PROFILE_PICS_DIR)
            if url:
                u.profile_picture_url = url
                db.add(u)
                results["users"]["migrated"] += 1
            else:
                results["users"]["failed"] += 1
        except Exception:
            results["users"]["failed"] += 1

    # Artist profile pics
    profs = db.query(ServiceProviderProfile).filter(ServiceProviderProfile.profile_picture_url.like("data:%")).all()
    results["artist_profile_pics"]["found"] = len(profs)
    for p in profs:
        try:
            url = write_data_url(p.profile_picture_url or "", PROFILE_PICS_DIR)
            if url:
                p.profile_picture_url = url
                db.add(p)
                results["artist_profile_pics"]["migrated"] += 1
            else:
                results["artist_profile_pics"]["failed"] += 1
        except Exception:
            results["artist_profile_pics"]["failed"] += 1

    # Artist cover photos
    covers = db.query(ServiceProviderProfile).filter(ServiceProviderProfile.cover_photo_url.like("data:%")).all()
    results["artist_cover_photos"]["found"] = len(covers)
    for p in covers:
        try:
            url = write_data_url(p.cover_photo_url or "", COVER_DIR)
            if url:
                p.cover_photo_url = url
                db.add(p)
                results["artist_cover_photos"]["migrated"] += 1
            else:
                results["artist_cover_photos"]["failed"] += 1
        except Exception:
            results["artist_cover_photos"]["failed"] += 1

    # Artist portfolio images array
    portfolios = db.query(ServiceProviderProfile).filter(ServiceProviderProfile.portfolio_image_urls.isnot(None)).all()
    for p in portfolios:
        try:
            imgs = list(p.portfolio_image_urls or [])
            changed = False
            for i, v in enumerate(imgs):
                if isinstance(v, str) and v.startswith("data:"):
                    results["artist_portfolio_images"]["found"] += 1
                    url = write_data_url(v, PORTFOLIO_DIR)
                    if url:
                        imgs[i] = url
                        changed = True
                        results["artist_portfolio_images"]["migrated"] += 1
                    else:
                        results["artist_portfolio_images"]["failed"] += 1
            if changed:
                p.portfolio_image_urls = imgs
                db.add(p)
        except Exception:
            # count as one failure for the profile object
            results["artist_portfolio_images"]["failed"] += 1

    db.commit()
    return results
