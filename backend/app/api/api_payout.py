from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
from typing import Optional
import os
import logging

from ..database import get_db
from sqlalchemy import text
from .. import models
from .dependencies import get_current_user
from ..utils import r2 as r2utils

router = APIRouter(tags=["payouts"])
logger = logging.getLogger(__name__)

REMIT_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "remittances")
os.makedirs(REMIT_DIR, exist_ok=True)


def _can_view_payout(db: Session, current_user: models.User, payout_id: int) -> bool:
    # Admins can view
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if is_admin:
        return True
    # Providers: must match provider_id on the payout
    try:
        row = db.execute(text("SELECT provider_id FROM payouts WHERE id=:id"), {"id": payout_id}).first()
        if not row:
            return False
        provider_id = int(row[0]) if row[0] is not None else None
        return provider_id == current_user.id
    except Exception:
        return False


@router.get("/{payout_id}/pdf")
def get_payout_pdf(
    payout_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # AuthZ: provider who owns the payout or admin
    if not _can_view_payout(db, current_user, int(payout_id)):
        from ..utils import error_response
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)

    # Import service lazily
    from ..services import remittance_pdf  # type: ignore

    filename = f"remittance_{payout_id}.pdf"
    path = os.path.abspath(os.path.join(REMIT_DIR, filename))
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        data = remittance_pdf.generate_pdf(db, int(payout_id))
        with open(path, "wb") as fh:
            fh.write(data)
    except Exception:
        # If generation fails, avoid raising PII; return 404
        from ..utils import error_response
        raise error_response("Remittance not available", {}, status.HTTP_404_NOT_FOUND)

    # Prefer R2 presigned inline URL
    try:
        key = r2utils.build_remittance_key(str(payout_id))
        with open(path, "rb") as fh:
            data = fh.read()
        r2utils.put_bytes(key, data, content_type="application/pdf")
        signed = r2utils.presign_get_by_key(key, filename=filename, content_type="application/pdf", inline=True)
        return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception:
        # Fallback to local file
        return FileResponse(path, media_type="application/pdf", filename=filename)
