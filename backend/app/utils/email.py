import asyncio
import logging
from email.message import EmailMessage

import aiosmtplib

from ..core.config import settings

logger = logging.getLogger(__name__)

SMTP_HOST = settings.SMTP_HOST
SMTP_PORT = settings.SMTP_PORT
SMTP_USERNAME = settings.SMTP_USERNAME
SMTP_PASSWORD = settings.SMTP_PASSWORD
SMTP_FROM = settings.SMTP_FROM


async def _send_async(msg: EmailMessage) -> None:
    await aiosmtplib.send(
        msg,
        hostname=SMTP_HOST,
        port=SMTP_PORT,
        username=SMTP_USERNAME,
        password=SMTP_PASSWORD,
        start_tls=bool(SMTP_USERNAME),
    )


def send_email(recipient: str, subject: str, body: str) -> None:
    """Send an email via SMTP and log failures."""
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        asyncio.run(_send_async(msg))
        logger.info("Sent email to %s", recipient)
    except Exception as exc:  # pragma: no cover - network issues
        logger.error("Failed to send email to %s: %s", recipient, exc)

