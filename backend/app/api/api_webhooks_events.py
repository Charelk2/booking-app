from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Any, List
import json
from ..database import get_db
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"]) 


@router.post("/webhooks/sendgrid")
async def sendgrid_webhook(request: Request, db: Session = Depends(get_db)):
    """Accept SendGrid event webhooks (array of JSON events).

    Stores a minimal subset into email_events table.
    """
    try:
        body = await request.body()
        events = json.loads(body.decode("utf-8"))
        if not isinstance(events, list):
            events = [events]
    except Exception as exc:
        logger.warning("Invalid SendGrid payload: %s", exc)
        return Response(status_code=400)

    for ev in events:
        try:
            message_id = ev.get("sg_message_id") or ev.get("smtp-id") or ev.get("message_id")
            to = ev.get("email") or ev.get("to")
            event = ev.get("event")
            template = (ev.get("template_id") or ev.get("category") or "")
            booking_id = ev.get("booking_id")
            user_id = ev.get("user_id")
            db.execute(
                text("INSERT INTO email_events (message_id, recipient, template, event, booking_id, user_id, payload) VALUES (:mid, :rcpt, :tpl, :evt, :bid, :uid, :payload)"),
                {"mid": message_id, "rcpt": to, "tpl": template, "evt": event, "bid": booking_id, "uid": user_id, "payload": json.dumps(ev)},
            )
        except Exception as exc:
            logger.warning("Failed to persist sendgrid event: %s", exc)
            db.rollback()
            continue
    db.commit()
    return {"status": "ok"}


@router.post("/webhooks/twilio/sms")
async def twilio_sms_webhook(request: Request, db: Session = Depends(get_db)):
    """Accept Twilio SMS status callbacks (form or JSON).

    Stores into sms_events.
    """
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)
    except Exception:
        data = {}

    sid = data.get("MessageSid") or data.get("sid")
    to = data.get("To") or data.get("to")
    status = data.get("MessageStatus") or data.get("status")
    booking_id = data.get("booking_id")
    user_id = data.get("user_id")
    try:
        db.execute(text("INSERT INTO sms_events (sid, recipient, status, booking_id, user_id, payload) VALUES (:sid, :rcpt, :st, :bid, :uid, :payload)"), {"sid": sid, "rcpt": to, "st": status, "bid": booking_id, "uid": user_id, "payload": json.dumps(data)})
        db.commit()
    except Exception:
        db.rollback()
    return {"status": "ok"}

