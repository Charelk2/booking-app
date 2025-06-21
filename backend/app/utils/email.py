import os
import asyncio
import logging
from email.message import EmailMessage

import aiosmtplib

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "25"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", "no-reply@localhost")


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

