from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.ops_scheduler import run_maintenance
from .. import models
from sqlalchemy import update
from sqlalchemy.sql import text

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
