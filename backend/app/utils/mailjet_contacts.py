import logging

import httpx

from app.core.config import settings

from .auth import normalize_email

logger = logging.getLogger(__name__)


def _mailjet_creds() -> tuple[str, str] | None:
    key = (getattr(settings, "MAILJET_API_KEY", "") or "").strip()
    secret = (getattr(settings, "MAILJET_API_SECRET", "") or "").strip()
    if key and secret:
        return key, secret

    # Mailjet uses the same API key/secret for SMTP auth in most setups.
    key = (getattr(settings, "SMTP_USERNAME", "") or "").strip()
    secret = (getattr(settings, "SMTP_PASSWORD", "") or "").strip()
    if key and secret:
        return key, secret

    return None


def _marketing_list_id() -> int | None:
    try:
        list_id = int(getattr(settings, "MAILJET_MARKETING_LIST_ID", 0) or 0)
        return list_id if list_id > 0 else None
    except Exception:
        return None


def sync_marketing_opt_in(email: str, opted_in: bool) -> None:
    """Best-effort Mailjet marketing list sync for a single contact.

    Requires MAILJET_MARKETING_LIST_ID and either MAILJET_API_KEY/MAILJET_API_SECRET
    or SMTP_USERNAME/SMTP_PASSWORD (Mailjet credentials) to be configured.
    """

    creds = _mailjet_creds()
    list_id = _marketing_list_id()
    if not creds or not list_id:
        return

    normalized = normalize_email(email)
    action = "addnoforce" if opted_in else "unsub"
    url = f"https://api.mailjet.com/v3/REST/contactslist/{list_id}/managecontact"

    try:
        with httpx.Client(timeout=8.0, auth=creds) as client:
            res = client.post(url, json={"Email": normalized, "Action": action})
            if res.status_code >= 400:
                body = ""
                try:
                    body = res.text[:2000]
                except Exception:
                    body = ""
                logger.warning(
                    "mailjet_marketing_sync_failed status=%s email=%s action=%s body=%s",
                    res.status_code,
                    normalized,
                    action,
                    body,
                )
    except Exception as exc:
        logger.warning(
            "mailjet_marketing_sync_error email=%s action=%s err=%s",
            normalized,
            action,
            exc,
        )
