from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.ops_scheduler import run_maintenance

router = APIRouter(tags=["ops"])


@router.post("/ops/scheduler/tick", status_code=status.HTTP_202_ACCEPTED)
def ops_tick(db: Session = Depends(get_db)):
    """Run maintenance tasks once and return a summary.

    Useful for manual testing or external cron when background tasks are disabled.
    """
    summary = run_maintenance(db)
    return {"status": "ok", **summary}

