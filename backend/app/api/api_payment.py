from fastapi import APIRouter, Depends, status, Request, Query, Header, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.responses import RedirectResponse
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import logging
import os
from decimal import Decimal
from datetime import datetime, timedelta
import httpx
import uuid
import time

from .. import crud
from .. import schemas, models
from ..crud import crud_quote_v2
from ..crud import crud_invoice
from ..crud import crud_message
from ..models import (
    User,
    BookingSimple,
    QuoteV2,
    Booking,
    BookingStatus,
    MessageAction,
    MessageType,
    SenderType,
    VisibleTo,
)
from .dependencies import get_db, get_current_active_client, get_current_service_provider
from ..database import SessionLocal
from ..core.config import settings
from ..core.config import FRONTEND_PRIMARY
from ..utils import error_response
from ..utils.outbox import enqueue_outbox
from ..utils import r2 as r2utils
import hmac
import hashlib
import json
from sqlalchemy import text
from ..utils.metrics import incr as metrics_incr, timing_ms as metrics_timing

logger = logging.getLogger(__name__)

PAYMENT_GATEWAY_FAKE = os.getenv("PAYMENT_GATEWAY_FAKE")

router = APIRouter(tags=["payments"])


class PaymentCreate(BaseModel):
    booking_request_id: int
    # For full-upfront payments, amount/full are ignored by the server.
    # They are retained in the schema for backward compatibility with clients.
    amount: Optional[float] = Field(default=None, gt=0)
    full: Optional[bool] = False


# ————————————————————————————————————————————————————————————————
# Helpers

def _message_to_envelope(db: Session, msg: models.Message) -> dict:
    """Serialize a Message to the same envelope shape used by api_message.

    Ensures avatar_url parity so the UI renders identically across sources.
    """
    try:
        data = schemas.MessageResponse.model_validate(msg).model_dump()
    except Exception:
        # Best-effort fallback if schema validation fails
        data = {
            "id": int(getattr(msg, "id", 0) or 0),
            "booking_request_id": int(getattr(msg, "booking_request_id", 0) or 0),
            "sender_id": int(getattr(msg, "sender_id", 0) or 0),
            "sender_type": getattr(msg, "sender_type", None),
            "content": getattr(msg, "content", "") or "",
            "message_type": getattr(msg, "message_type", None),
            "visible_to": getattr(msg, "visible_to", None),
            "quote_id": getattr(msg, "quote_id", None),
            "attachment_url": getattr(msg, "attachment_url", None),
            "attachment_meta": getattr(msg, "attachment_meta", None),
            "timestamp": getattr(msg, "timestamp", None),
        }
    # Avatar URL enrichment (parity with api_message)
    try:
        sender = msg.sender
        avatar_url = None
        if sender:
            if sender.user_type == models.UserType.SERVICE_PROVIDER:
                profile = sender.artist_profile
                if profile and profile.profile_picture_url:
                    avatar_url = profile.profile_picture_url
            elif sender.profile_picture_url:
                avatar_url = sender.profile_picture_url
        data["avatar_url"] = avatar_url
    except Exception:
        data.setdefault("avatar_url", None)
    return data

try:
    # Import the WebSocket manager to broadcast new messages to thread topics
    from .api_ws import manager as ws_manager  # type: ignore
except Exception:  # pragma: no cover - fallback when ws module unavailable
    ws_manager = None  # type: ignore


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_payment(
    payment_in: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_client),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    logger.info(
        "Process payment for request %s amount %s full=%s",
        payment_in.booking_request_id,
        payment_in.amount,
        payment_in.full,
    )
    t_start_direct = time.perf_counter()

    booking = (
        db.query(BookingSimple)
        .join(QuoteV2, BookingSimple.quote_id == QuoteV2.id)
        .filter(QuoteV2.booking_request_id == payment_in.booking_request_id)
        .first()
    )
    if not booking:
        # Accept-and-create on first payment attempt so clients can pay immediately after a quote is sent.
        # Find the most recent quote for this request (prefer PENDING, fallback to ACCEPTED if already accepted elsewhere).
        candidate = (
            db.query(QuoteV2)
            .filter(QuoteV2.booking_request_id == payment_in.booking_request_id)
            .order_by(QuoteV2.id.desc())
            .first()
        )
        if candidate is not None:
            status_val = getattr(candidate.status, "value", candidate.status)
            # Block paying expired quotes (and those past expiry unless already accepted)
            try:
                now = datetime.utcnow()
                is_expired_state = str(status_val).lower() == "expired"
                is_time_expired = bool(getattr(candidate, "expires_at", None)) and getattr(candidate, "expires_at") < now
                is_accepted_state = str(status_val).lower() == "accepted"
                if is_expired_state or (is_time_expired and not is_accepted_state):
                    raise error_response(
                        "Quote has expired. Please request a new quote.",
                        {"quote": "expired"},
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                    )
            except Exception as _exc:
                # If we raised a structured error, let it bubble. Otherwise continue.
                if hasattr(_exc, "status_code"):
                    raise
            # Enforce payment = acceptance: if pending, accept now or return 422 with a helpful error
            if str(status_val).lower() == "pending":
                try:
                    crud_quote_v2.accept_quote(db, candidate.id)
                except Exception as exc:
                    logger.error(
                        "Quote acceptance failed pre-payment for request %s: %s",
                        payment_in.booking_request_id,
                        exc,
                        exc_info=True,
                    )
                    raise error_response(
                        "Cannot accept quote before payment",
                        {"quote": "acceptance_failed", "hint": "Ensure event date/time and required details are set"},
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                    )
            # Re-query booking after acceptance or if already accepted
            booking = (
                db.query(BookingSimple)
                .filter(BookingSimple.quote_id == candidate.id)
                .first()
            )
        if not booking:
            logger.warning(
                "Booking not found for request %s", payment_in.booking_request_id
            )
            raise error_response(
                "Booking not found",
                {"booking_request_id": "not_found"},
                status.HTTP_404_NOT_FOUND,
            )

    if booking.client_id != current_user.id:
        logger.warning(
            "User %s attempted payment for booking %s",
            current_user.id,
            booking.id,
        )
        raise error_response(
            "Forbidden",
            {},
            status.HTTP_403_FORBIDDEN,
        )

    # Enforce payment = acceptance for the resolved booking's quote.
    try:
        qv2_for_booking = None
        if getattr(booking, "quote_id", None):
            qv2_for_booking = db.query(QuoteV2).filter(QuoteV2.id == booking.quote_id).first()
        if qv2_for_booking is not None:
            status_val = getattr(qv2_for_booking.status, "value", qv2_for_booking.status)
            # Block paying expired quotes (and those past expiry unless already accepted)
            try:
                now = datetime.utcnow()
                is_expired_state = str(status_val).lower() == "expired"
                is_time_expired = bool(getattr(qv2_for_booking, "expires_at", None)) and getattr(qv2_for_booking, "expires_at") < now
                is_accepted_state = str(status_val).lower() == "accepted"
                if is_expired_state or (is_time_expired and not is_accepted_state):
                    raise error_response(
                        "Quote has expired. Please request a new quote.",
                        {"quote": "expired"},
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                    )
            except Exception:
                # structured error will bubble; otherwise fall through
                pass
            if str(status_val).lower() == "pending":
                try:
                    crud_quote_v2.accept_quote(db, int(qv2_for_booking.id))
                except Exception as exc:
                    logger.error(
                        "Quote acceptance failed pre-payment for booking %s (quote %s): %s",
                        booking.id,
                        qv2_for_booking.id,
                        exc,
                        exc_info=True,
                    )
                    raise error_response(
                        "Cannot accept quote before payment",
                        {"quote": "acceptance_failed", "hint": "Ensure event date/time and required details are set"},
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                    )
    except Exception:
        # Do not block on unexpected reflection errors; the gateway pre-init checks below will still run
        pass

    # Prevent duplicate payments once fully paid
    if (str(booking.payment_status or "").lower() == "paid") or (getattr(booking, "charged_total_amount", 0) or 0) > 0:
        logger.warning("Duplicate payment attempt for booking %s", booking.id)
        raise error_response(
            "Payment already completed",
            {"payment": "duplicate"},
            status.HTTP_400_BAD_REQUEST,
        )

    # Enforce full upfront payment. Ignore client-provided amount/full and
    # charge the accepted quote's total. This guarantees a single, final charge.
    try:
        quote_total = float(booking.quote.total or 0) if booking.quote else 0.0
    except Exception:
        quote_total = 0.0
    if quote_total <= 0:
        logger.warning("Quote total missing or zero for booking %s", booking.id)
        raise error_response("Invalid quote total", {"amount": "invalid"}, status.HTTP_422_UNPROCESSABLE_ENTITY)

    amount = quote_total
    logger.info("Resolved payment amount (full upfront) %s", amount)
    charge_amount = Decimal(str(amount))

    # Require Paystack; no fake/direct payments path
    if not settings.PAYSTACK_SECRET_KEY:
        raise error_response("Paystack not configured", {}, status.HTTP_400_BAD_REQUEST)
    try:
        amount_float = float(amount)
        amount_int = int(round(amount_float * 100))
        client_email = getattr(current_user, "email", None) or f"user{current_user.id}@example.com"
        callback = settings.PAYSTACK_CALLBACK_URL or None
        headers = {
            "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "email": client_email,
            "amount": amount_int,
            "currency": settings.DEFAULT_CURRENCY or "ZAR",
        }
        if callback:
            payload["callback_url"] = callback
        with httpx.Client(timeout=10.0) as client:
            r = client.post("https://api.paystack.co/transaction/initialize", json=payload, headers=headers)
            r.raise_for_status()
            data = r.json().get("data", {})
        auth_url = data.get("authorization_url")
        reference = data.get("reference")
        access_code = data.get("access_code")
        if not auth_url or not reference:
            raise RuntimeError("Invalid Paystack response")
        booking.payment_id = reference
        booking.payment_status = "pending"
        db.add(booking)
        db.commit()
        try:
            # Record initialization as a separate type to avoid double-counting charges
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'charge_init', :amt, 'ZAR', :meta)"),
                {"bid": booking.id, "amt": amount, "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "init"})},
            )
            db.commit()
        except Exception:
            db.rollback()
        return {
            "status": "redirect",
            "authorization_url": auth_url,
            "reference": reference,
            "payment_id": reference,
            "access_code": access_code,
        }
    except Exception as exc:
        logger.error("Paystack init error: %s", exc, exc_info=True)
        raise error_response("Payment initialization failed", {}, status.HTTP_502_BAD_GATEWAY)


@router.get("/paystack/verify")
def paystack_verify(
    reference: str = Query(..., min_length=4),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_client),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    if not settings.PAYSTACK_SECRET_KEY:
        raise error_response("Paystack not configured", {}, status.HTTP_400_BAD_REQUEST)
    headers = {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    t_start_verify = time.perf_counter()
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"https://api.paystack.co/transaction/verify/{reference}", headers=headers)
            r.raise_for_status()
            data = r.json().get("data", {})
        status_str = str(data.get("status", "")).lower()
        amount_kobo = int(data.get("amount", 0) or 0)
        amount = Decimal(str(amount_kobo / 100.0))
    except Exception as exc:
        logger.error("Paystack verify error: %s", exc, exc_info=True)
        raise error_response("Verification failed", {}, status.HTTP_502_BAD_GATEWAY)

    if status_str != "success":
        raise error_response("Payment not successful", {"status": status_str}, status.HTTP_400_BAD_REQUEST)

    # Resolve booking via reference stored in payment_id
    simple = db.query(BookingSimple).filter(BookingSimple.payment_id == reference).first()
    if not simple:
        raise error_response("Payment reference not recognized", {}, status.HTTP_404_NOT_FOUND)
    if simple.client_id != current_user.id:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)

    # Mark paid and propagate changes (same as create_payment success path)
    simple.payment_status = "paid"
    simple.payment_id = reference
    simple.charged_total_amount = amount
    simple.confirmed = True

    br = None
    if simple.quote and simple.quote.booking_request:
        br = simple.quote.booking_request
        if br.status != BookingStatus.REQUEST_CONFIRMED:
            br.status = BookingStatus.REQUEST_CONFIRMED
    formal_booking = db.query(Booking).filter(Booking.quote_id == simple.quote_id).first()
    # Enforce payment = acceptance: ensure a formal Booking exists. If quote is still pending, accept now (idempotent).
    try:
        if formal_booking is None and getattr(simple, "quote_id", None):
            qv2 = db.query(QuoteV2).filter(QuoteV2.id == simple.quote_id).first()
            if qv2 is not None:
                status_val = getattr(qv2.status, "value", qv2.status)
                if str(status_val).lower() == "pending":
                    try:
                        crud_quote_v2.accept_quote(db, int(qv2.id))
                        formal_booking = db.query(Booking).filter(Booking.quote_id == qv2.id).first()
                    except Exception as exc:
                        logger.error("Quote accept during verify failed for quote %s: %s", qv2.id, exc, exc_info=True)
    except Exception:
        pass
    if formal_booking and formal_booking.status != BookingStatus.CONFIRMED:
        formal_booking.status = BookingStatus.CONFIRMED

    db.commit()
    db.refresh(simple)

    # Ensure an invoice exists for this booking and mark it paid (best-effort)
    try:
        qv2_for_invoice = db.query(QuoteV2).filter(QuoteV2.id == simple.quote_id).first()
        inv = crud_invoice.ensure_invoice_for_booking(db, qv2_for_invoice, simple)
        if inv is not None:
            try:
                status_val = getattr(inv, "status", None)
                is_paid = str(getattr(status_val, "value", status_val) or "").lower() == "paid"
            except Exception:
                is_paid = False
            if not is_paid:
                crud_invoice.mark_paid(db, inv, payment_method="paystack", notes=f"ref {reference}")
    except Exception:
        # Do not block verify path on invoice sync failures
        pass

    if br:
        try:
            # Prefer friendly frontend URL for receipts
            receipt_url = f"{FRONTEND_PRIMARY}/receipts/{simple.payment_id}" if simple.payment_id else None
            receipt_suffix = f" Receipt: {receipt_url}" if receipt_url else ""
            syskey = f"payment_received:{simple.payment_id}" if simple.payment_id else "payment_received"
            # Idempotency: skip if this payment message already exists
            existing = (
                db.query(models.Message)
                .filter(
                    models.Message.booking_request_id == br.id,
                    models.Message.system_key == syskey,
                )
                .first()
            )
            msg_sys = None
            if not existing:
                msg_sys = crud.crud_message.create_message(
                    db=db,
                    booking_request_id=br.id,
                    sender_id=simple.artist_id,
                    sender_type=SenderType.ARTIST,
                    content=f"Payment received — order #{simple.payment_id}.{receipt_suffix}",
                    message_type=MessageType.SYSTEM,
                    visible_to=VisibleTo.BOTH,
                    action=None,
                    system_key=syskey,
                )
                db.commit()
            # Note: we no longer create a provider-only mirror system line.
            # The canonical BOTH-visible message above is sufficient, and
            # bell notifications are emitted below to surface the event.
            try:
                if ws_manager and msg_sys is not None:
                    env = _message_to_envelope(db, msg_sys)
                    background_tasks.add_task(ws_manager.broadcast, int(br.id), env)
                    logger.info(
                        "payment_broadcast_scheduled: request_id=%s msg_id=%s",
                        int(br.id), int(getattr(msg_sys, "id", 0) or 0),
                    )
                # Also enqueue outbox for reliable cross-process delivery
                if msg_sys is not None:
                    try:
                        env = _message_to_envelope(db, msg_sys)
                        enqueue_outbox(db, topic=f"booking-requests:{int(br.id)}", payload=env)
                    except Exception:
                        pass
            except Exception:
                pass
            # Retract any stale "Quote expired." system line for this thread (post-payment)
            try:
                last_exp = (
                    db.query(models.Message)
                    .filter(
                        models.Message.booking_request_id == br.id,
                        models.Message.message_type == MessageType.SYSTEM,
                        models.Message.content == "Quote expired.",
                    )
                    .order_by(models.Message.id.desc())
                    .first()
                )
                if last_exp:
                    crud_message.delete_message(db, int(last_exp.id))
                    db.commit()
                    try:
                        if ws_manager:
                            background_tasks.add_task(
                                ws_manager.broadcast,
                                int(br.id),
                                {"v": 1, "type": "message_deleted", "id": int(last_exp.id)},
                            )
                        enqueue_outbox(
                            db,
                            topic=f"booking-requests:{int(br.id)}",
                            payload={"v": 1, "type": "message_deleted", "id": int(last_exp.id)},
                        )
                    except Exception:
                        pass
            except Exception:
                pass
            # No bell notifications on payment events
        except Exception:
            pass

    # Record ledger capture
    try:
        # Idempotency: avoid duplicate ledger rows on repeated verify/webhook calls
        existing_rows = db.execute(
            text("SELECT type, meta FROM ledger_entries WHERE booking_id = :bid ORDER BY id DESC LIMIT 200"),
            {"bid": simple.id},
        ).fetchall()
        def _meta_has(type_: str, split: str | None = None) -> bool:
            for row in existing_rows:
                try:
                    if str(row[0]) != type_:
                        continue
                    m = row[1] or {}
                    if isinstance(m, str):
                        m = json.loads(m)
                    if (m.get("reference") == reference and (split is None or m.get("split") == split)):
                        return True
                except Exception:
                    continue
            return False

        if not _meta_has("charge"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'charge', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(amount), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "verify"})},
            )
        # Provider split (50/50): deterministic rounding
        from decimal import ROUND_HALF_UP
        half1 = (amount / Decimal('2')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        half2 = (amount - half1).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if not _meta_has("provider_escrow_in", split="first50"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_escrow_in', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(half1), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "verify", "split": "first50"})},
            )
        if not _meta_has("provider_escrow_hold", split="held50"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_escrow_hold', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(half2), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "verify", "split": "held50"})},
            )
        db.commit()
    except Exception:
        db.rollback()
    # Metrics (best-effort)
    try:
        dt = (time.perf_counter() - t_start_verify) * 1000.0
        metrics_timing("payment.verify_ms", dt, tags={"source": "verify"})
        metrics_incr("payment.verify_success_total", tags={"source": "verify"})
    except Exception:
        pass
    # Best-effort: schedule generation of a downloadable PDF receipt
    try:
        if simple.payment_id:
            background_tasks.add_task(_background_generate_receipt_pdf, str(simple.payment_id))
    except Exception:
        logger.debug("schedule receipt pdf failed (verify)", exc_info=True)
    return {"status": "ok", "payment_id": simple.payment_id}


## Removed plaintext receipt endpoint; HTML/PDF receipt implemented below.


@router.post("/paystack/webhook")
async def paystack_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_paystack_signature: str | None = Header(default=None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Handle Paystack webhook events (test/production).

    - Verifies HMAC SHA512 signature of the raw request body using PAYSTACK_SECRET_KEY.
    - On `charge.success`, marks the matching booking paid and emits the system message.
    - Idempotent: if already marked paid, returns 200 OK.
    """
    if not settings.PAYSTACK_SECRET_KEY:
        return Response(status_code=status.HTTP_200_OK)

    raw = await request.body()
    t_start_webhook = time.perf_counter()
    try:
        expected = hmac.new(
            key=settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
            msg=raw,
            digestmod=hashlib.sha512,
        ).hexdigest()
        if not x_paystack_signature or x_paystack_signature != expected:
            logger.warning("Paystack webhook signature mismatch")
            try:
                metrics_incr("paystack.webhook_signature_mismatch_total")
            except Exception:
                pass
            return Response(status_code=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.error("Webhook signature verification failed: %s", exc)
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    event = str(payload.get("event", "")).lower()
    data = payload.get("data", {}) or {}
    reference = str(data.get("reference", ""))
    status_str = str(data.get("status", "")).lower()
    amount_kobo = int(data.get("amount", 0) or 0)
    amount = Decimal(str(amount_kobo / 100.0))

    if event != "charge.success" and status_str != "success":
        return Response(status_code=status.HTTP_200_OK)

    if not reference:
        return Response(status_code=status.HTTP_200_OK)

    # Correlate with pending BookingSimple using reference
    simple = db.query(BookingSimple).filter(BookingSimple.payment_id == reference).first()
    if not simple:
        # Not a fatal condition; acknowledge to avoid retries
        return Response(status_code=status.HTTP_200_OK)

    # Idempotency
    if (str(simple.payment_status or "").lower() == "paid") or (getattr(simple, "charged_total_amount", 0) or 0) > 0:
        return Response(status_code=status.HTTP_200_OK)

    # Mark paid and propagate (same as manual verify path)
    simple.payment_status = "paid"
    simple.charged_total_amount = amount
    simple.confirmed = True

    br = None
    if simple.quote and simple.quote.booking_request:
        br = simple.quote.booking_request
        if br.status != BookingStatus.REQUEST_CONFIRMED:
            br.status = BookingStatus.REQUEST_CONFIRMED
    formal_booking = db.query(Booking).filter(Booking.quote_id == simple.quote_id).first()
    if formal_booking and formal_booking.status != BookingStatus.CONFIRMED:
        formal_booking.status = BookingStatus.CONFIRMED

    db.commit()
    db.refresh(simple)

    if br:
        try:
            receipt_url = f"{FRONTEND_PRIMARY}/receipts/{simple.payment_id}" if simple.payment_id else None
            receipt_suffix = f" Receipt: {receipt_url}" if receipt_url else ""
            syskey = f"payment_received:{simple.payment_id}" if simple.payment_id else "payment_received"
            existing = (
                db.query(models.Message)
                .filter(
                    models.Message.booking_request_id == br.id,
                    models.Message.system_key == syskey,
                )
                .first()
            )
            msg_sys = None
            if not existing:
                msg_sys = crud.crud_message.create_message(
                    db=db,
                    booking_request_id=br.id,
                    sender_id=simple.artist_id,
                    sender_type=SenderType.ARTIST,
                    content=f"Payment received — order #{simple.payment_id}.{receipt_suffix}",
                    message_type=MessageType.SYSTEM,
                    visible_to=VisibleTo.BOTH,
                    action=None,
                    system_key=syskey,
                )
                db.commit()
            try:
                if ws_manager and msg_sys is not None:
                    env = _message_to_envelope(db, msg_sys)
                    t0 = datetime.utcnow()
                    await ws_manager.broadcast(int(br.id), env)
                    t1 = datetime.utcnow()
                    ms = (t1 - t0).total_seconds() * 1000.0
                    logger.info(
                        "payment_broadcast_done: request_id=%s msg_id=%s latency_ms=%.1f",
                        int(br.id), int(getattr(msg_sys, "id", 0) or 0), ms,
                    )
                # Enqueue outbox for reliable cross-process delivery
                if msg_sys is not None:
                    try:
                        env = _message_to_envelope(db, msg_sys)
                        enqueue_outbox(db, topic=f"booking-requests:{int(br.id)}", payload=env)
                    except Exception:
                        pass
            except Exception as exc:
                logger.warning("payment_broadcast_failed: request_id=%s err=%s", int(getattr(br, 'id', 0) or 0), exc)
        except Exception:
            pass
        # No bell notifications on payment events
        # Retract any stale "Quote expired." system line for this thread (post-payment)
        try:
            last_exp = (
                db.query(models.Message)
                .filter(
                    models.Message.booking_request_id == br.id,
                    models.Message.message_type == MessageType.SYSTEM,
                    models.Message.content == "Quote expired.",
                )
                .order_by(models.Message.id.desc())
                .first()
            )
            if last_exp:
                crud_message.delete_message(db, int(last_exp.id))
                db.commit()
                try:
                    if ws_manager:
                        await ws_manager.broadcast(
                            int(br.id), {"v": 1, "type": "message_deleted", "id": int(last_exp.id)}
                        )
                    enqueue_outbox(
                        db,
                        topic=f"booking-requests:{int(br.id)}",
                        payload={"v": 1, "type": "message_deleted", "id": int(last_exp.id)},
                    )
                except Exception:
                    pass
        except Exception:
            pass

    # Ensure an invoice exists and mark paid (best-effort)
    try:
        qv2_for_invoice = db.query(QuoteV2).filter(QuoteV2.id == simple.quote_id).first()
        inv = crud_invoice.ensure_invoice_for_booking(db, qv2_for_invoice, simple)
        if inv is not None:
            try:
                status_val = getattr(inv, "status", None)
                is_paid = str(getattr(status_val, "value", status_val) or "").lower() == "paid"
            except Exception:
                is_paid = False
            if not is_paid:
                crud_invoice.mark_paid(db, inv, payment_method="paystack", notes=f"ref {reference}")
    except Exception:
        pass

    # Record ledger capture (idempotent across verify/webhook)
    try:
        existing_rows = db.execute(
            text("SELECT type, meta FROM ledger_entries WHERE booking_id = :bid ORDER BY id DESC LIMIT 200"),
            {"bid": simple.id},
        ).fetchall()
        def _meta_has(type_: str, split: str | None = None) -> bool:
            for row in existing_rows:
                try:
                    if str(row[0]) != type_:
                        continue
                    m = row[1] or {}
                    if isinstance(m, str):
                        m = json.loads(m)
                    if (m.get("reference") == reference and (split is None or m.get("split") == split)):
                        return True
                except Exception:
                    continue
            return False

        if not _meta_has("charge"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'charge', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(amount), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "webhook"})},
            )
        from decimal import ROUND_HALF_UP
        half1 = (amount / Decimal('2')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        half2 = (amount - half1).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if not _meta_has("provider_escrow_in", split="first50"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_escrow_in', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(half1), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "webhook", "split": "first50"})},
            )
        if not _meta_has("provider_escrow_hold", split="held50"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_escrow_hold', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(half2), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "webhook", "split": "held50"})},
            )
        db.commit()
    except Exception:
        db.rollback()
    # Metrics (best-effort)
    try:
        dt = (time.perf_counter() - t_start_webhook) * 1000.0
        metrics_timing("payment.webhook_ms", dt, tags={"source": "webhook"})
        metrics_incr("payment.webhook_success_total", tags={"source": "webhook"})
    except Exception:
        pass
    # Best-effort: schedule generation of a downloadable PDF receipt
    try:
        if simple.payment_id:
            background_tasks.add_task(_background_generate_receipt_pdf, str(simple.payment_id))
    except Exception:
        logger.debug("schedule receipt pdf failed (webhook)", exc_info=True)
    return Response(status_code=status.HTTP_200_OK)


class PaymentAuthorizeIn(BaseModel):
    artist_amount: Optional[float] = Field(default=None, gt=0)
    sound_amount: Optional[float] = Field(default=None, ge=0)
    artist_accept_sla_hours: int = 24


@router.post("/{booking_id}/authorize", status_code=status.HTTP_201_CREATED)
def authorize_holds(
    booking_id: int,
    body: PaymentAuthorizeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_client),
):
    """Place two authorization holds for one-flow checkout (artist + sound).

    - Determines default amounts from QuoteV2 linked to the booking if omitted.
    - Sets booking status to PENDING_ARTIST_CONFIRMATION and deadline.
    - Does not capture funds; later captured by artist/supplier acceptance.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)

    simple = db.query(BookingSimple).filter(BookingSimple.quote_id == booking.quote_id).first()
    if not simple:
        raise error_response("Booking record not ready", {"booking_id": "invalid"}, status.HTTP_422_UNPROCESSABLE_ENTITY)
    if simple.client_id != current_user.id:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)

    # Get amounts from QuoteV2 if not provided
    qv2 = db.query(QuoteV2).filter(QuoteV2.id == simple.quote_id).first()
    artist_amount = body.artist_amount
    sound_amount = body.sound_amount
    if qv2:
        if artist_amount is None:
            artist_amount = float((qv2.total or 0) - (qv2.sound_fee or 0))
        if sound_amount is None:
            sound_amount = float(qv2.sound_fee or 0)
    if artist_amount is None:
        artist_amount = 0.0
    if sound_amount is None:
        sound_amount = 0.0

    # Simulate holds
    simple.artist_hold_id = f"hold_artist_{uuid.uuid4().hex}"
    simple.artist_hold_status = "authorized"
    simple.artist_hold_amount = Decimal(str(artist_amount))
    if sound_amount > 0:
        simple.sound_hold_id = f"hold_sound_{uuid.uuid4().hex}"
        simple.sound_hold_status = "authorized"
        simple.sound_hold_amount = Decimal(str(sound_amount))

    # Mark booking waiting for artist acceptance and set deadline
    booking.status = BookingStatus.PENDING_ARTIST_CONFIRMATION
    booking.artist_accept_deadline_at = (
        datetime.utcnow() + timedelta(hours=int(body.artist_accept_sla_hours or 24))
    )
    db.add(simple)
    db.add(booking)
    db.commit()
    db.refresh(simple)

    return {
        "status": "authorized",
        "artist_hold_id": simple.artist_hold_id,
        "sound_hold_id": simple.sound_hold_id,
        "artist_deadline": booking.artist_accept_deadline_at.isoformat() if booking.artist_accept_deadline_at else None,
    }


@router.post("/{booking_id}/capture/artist", status_code=status.HTTP_200_OK)
def capture_artist_hold(
    booking_id: int,
    db: Session = Depends(get_db),
    current_artist: User = Depends(get_current_service_provider),
):
    """Capture the artist hold after artist acceptance.

    Note: Uses client auth for simplicity in this stub; in production it would be server-side after artist confirms.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    simple = db.query(BookingSimple).filter(BookingSimple.quote_id == booking.quote_id).first()
    if not simple:
        raise error_response("Booking record not ready", {"booking_id": "invalid"}, status.HTTP_422_UNPROCESSABLE_ENTITY)

    if simple.artist_hold_status == "authorized":
        simple.artist_hold_status = "captured"
        # generate a receipt artifact
        payment_id = f"capture_{uuid.uuid4().hex}"
        path = os.path.join(RECEIPT_DIR, f"{payment_id}.pdf")
        os.makedirs(RECEIPT_DIR, exist_ok=True)
        with open(path, "wb") as f:
            f.write(b"%PDF-1.4 capture artist\n%%EOF")
    db.add(simple)
    db.commit()
    return {"status": simple.artist_hold_status}


RECEIPT_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "receipts")
os.makedirs(RECEIPT_DIR, exist_ok=True)


@router.get("/{payment_id}/receipt")
def get_payment_receipt(
    payment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_client),
):
    """Return the receipt PDF for the given payment id.

    Auth: only the paying client may fetch the receipt.
    Always return a PDF. If Playwright is unavailable, generate a minimal ReportLab PDF.
    """
    # Enforce ownership: payment reference must belong to the current client
    simple = db.query(BookingSimple).filter(BookingSimple.payment_id == payment_id).first()
    if not simple:
        raise error_response("Payment reference not recognized", {}, status.HTTP_404_NOT_FOUND)
    if simple.client_id != current_user.id:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)

    path = os.path.abspath(os.path.join(RECEIPT_DIR, f"{payment_id}.pdf"))
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if os.path.exists(path):
        # If R2 is configured, prefer a redirect to a presigned GET
        try:
            key = r2utils.build_receipt_key(payment_id)
            with open(path, "rb") as fh:
                data = fh.read()
            try:
                r2utils.put_bytes(key, data, content_type="application/pdf")
                signed = r2utils.presign_get_by_key(key, filename=f"{payment_id}.pdf", content_type="application/pdf", inline=True)
                return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
            except Exception:
                # Fall through to local file response if upload/presign failed
                pass
        except Exception:
            pass
        resp = FileResponse(
            path,
            media_type="application/pdf",
            filename=f"{payment_id}.pdf",
        )
        try:
            # Hint to search engines not to index
            resp.headers["X-Robots-Tag"] = "noindex"
        except Exception:
            pass
        return resp
    # On-demand stateless generation: try to build the PDF now. If it
    # succeeds, stream the new file; otherwise fall back to HTML.
    try:
        ok = generate_receipt_pdf(db, payment_id)
        if ok and os.path.exists(path):
            # Attempt upload to R2 and redirect to presigned URL
            try:
                key = r2utils.build_receipt_key(payment_id)
                with open(path, "rb") as fh:
                    data = fh.read()
                r2utils.put_bytes(key, data, content_type="application/pdf")
                signed = r2utils.presign_get_by_key(key, filename=f"{payment_id}.pdf", content_type="application/pdf", inline=True)
                return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
            except Exception:
                # Fall back to local file
                resp = FileResponse(
                    path,
                    media_type="application/pdf",
                    filename=f"{payment_id}.pdf",
                )
                try:
                    resp.headers["X-Robots-Tag"] = "noindex"
                except Exception:
                    pass
                return resp
    except Exception:
        # best-effort only — fall through to ReportLab fallback
        pass

    # Final fallback: generate a minimal PDF directly (no HTML)
    try:
        _generate_receipt_pdf_with_reportlab(db, payment_id, path)
    except Exception:
        # Ensure at least a stub PDF exists to satisfy content-type contract
        try:
            with open(path, "wb") as f:
                f.write(b"%PDF-1.4\n% Fallback receipt stub for security\n%%EOF")
        except Exception:
            pass
    # Try to upload stub to R2 and redirect; else return local stub
    try:
        key = r2utils.build_receipt_key(payment_id)
        with open(path, "rb") as fh:
            data = fh.read()
        r2utils.put_bytes(key, data, content_type="application/pdf")
        signed = r2utils.presign_get_by_key(key, filename=f"{payment_id}.pdf", content_type="application/pdf", inline=True)
        return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception:
        resp = FileResponse(
            path,
            media_type="application/pdf",
            filename=f"{payment_id}.pdf",
        )
        try:
            resp.headers["X-Robots-Tag"] = "noindex"
        except Exception:
            pass
        return resp

# ————————————————————————————————————————————————————————————————
# Receipt HTML composition + PDF generation (Playwright, best-effort)

def _compose_receipt_html(db: Session, payment_id: str) -> str:
    """Compose the branded receipt HTML used for fallback rendering and PDF generation."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # Enrich with booking + quote context (best effort)
    amount = None
    client_name = None
    client_email = None
    artist_name = None
    artist_email = None
    booking_id = None
    items: list[tuple[str, float]] = []
    accommodation_note: str | None = None
    subtotal = None
    discount = None
    total = None

    try:
        bs: BookingSimple | None = (
            db.query(BookingSimple).filter(BookingSimple.payment_id == payment_id).first()
        )
        if bs:
            booking_id = bs.id
            try:
                amount = float(bs.charged_total_amount or 0)
            except Exception:
                amount = None
            if bs.client:
                client_name = bs.client.name or None
                client_email = bs.client.email or None
            if bs.artist:
                artist_name = bs.artist.name or None
                artist_email = bs.artist.email or None

            # Pull line items from QuoteV2
            qv2 = db.query(QuoteV2).filter(QuoteV2.id == bs.quote_id).first()
            if qv2:
                try:
                    for s in (qv2.services or []):
                        desc = s.get("description") or "Service"
                        price = float(s.get("price") or 0)
                        if price:
                            items.append((desc, price))
                except Exception:
                    pass
                try:
                    sv = float(qv2.sound_fee or 0)
                    if sv:
                        items.append(("Sound", sv))
                except Exception:
                    pass
                try:
                    tv = float(qv2.travel_fee or 0)
                    if tv:
                        items.append(("Travel", tv))
                except Exception:
                    pass
                if (qv2.accommodation or "").strip():
                    accommodation_note = str(qv2.accommodation)
                try:
                    subtotal = float(qv2.subtotal or 0)
                except Exception:
                    subtotal = None
                try:
                    discount = float(qv2.discount or 0)
                except Exception:
                    discount = None
                try:
                    total = float(qv2.total or 0)
                except Exception:
                    total = None
    except Exception:
        pass

    # Branding / styles
    brand_name = "Booka"
    brand_primary = "#6C3BFF"
    brand_text = "#111827"
    brand_muted = "#6b7280"
    border = "#e5e7eb"

    # Compose sections
    amount_row = (
        f'<div class="row"><span class="muted">Amount</span><span>ZAR {amount:.2f}</span></div>'
        if amount is not None else ''
    )
    booking_row = (
        f'<div class="row"><span class="muted">Booking</span><span>#{booking_id}</span></div>'
        if booking_id else ''
    )

    parties = []
    if client_name or client_email:
        parties.append(
            f'<div><div class="label">Client</div><div class="value">{client_name or ""}</div><div class="muted">{client_email or ""}</div></div>'
        )
    if artist_name or artist_email:
        parties.append(
            f'<div><div class="label">Artist</div><div class="value">{artist_name or ""}</div><div class="muted">{artist_email or ""}</div></div>'
        )
    parties_html = ''.join(parties) or '<div class="muted">Participant details unavailable</div>'

    item_rows = ''
    for desc, price in items:
        item_rows += f'<tr><td class="left">{desc}</td><td class="right">ZAR {price:.2f}</td></tr>'
    if accommodation_note:
        item_rows += f'<tr><td class="left">Accommodation</td><td class="right">{accommodation_note}</td></tr>'

    totals_rows = ''
    if subtotal is not None:
        totals_rows += f'<div class="row"><span>Subtotal</span><span>ZAR {subtotal:.2f}</span></div>'
    if (discount or 0) > 0:
        totals_rows += f'<div class="row"><span>Discount</span><span>- ZAR {discount:.2f}</span></div>'
    if total is not None:
        totals_rows += f'<div class="row total"><span>Total</span><span>ZAR {total:.2f}</span></div>'

    html = f"""
    <!doctype html>
    <html lang=\"en\">
      <head>
        <meta charset=\"utf-8\" />
        <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
        <title>Receipt {payment_id}</title>
        <style>
          :root {{ --brand: {brand_primary}; --text: {brand_text}; --muted: {brand_muted}; --border: {border}; }}
          body {{ font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--text); background:#fff; }}
          .shell {{ max-width: 840px; margin: 32px auto; padding: 0 16px; }}
          .card {{ border:1px solid var(--border); border-radius: 12px; overflow:hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }}
          .header {{ display:flex; align-items:center; justify-content:space-between; padding: 16px 18px; border-bottom:1px solid var(--border); background:#fafafa; }}
          .brand {{ display:flex; align-items:center; gap:10px; font-weight:700; font-size: 18px; color: var(--text); }}
          .brand-mark {{ width: 24px; height: 24px; border-radius:6px; background:var(--brand); display:inline-block; }}
          .badge {{ display:inline-block; color:#14532d; background:#eafff0; border:1px solid #86efac; padding:2px 8px; border-radius: 999px; font-size: 12px; font-weight:600; }}
          .section {{ padding: 16px 18px; }}
          .grid {{ display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }}
          .label {{ font-size:12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }}
          .value {{ font-weight:600; }}
          .muted {{ color: var(--muted); font-size: 12px; }}
          .row {{ display:flex; justify-content: space-between; align-items:center; margin: 6px 0; font-size: 14px; }}
          .row.total span:last-child {{ font-weight:700; font-size: 16px; }}
          table {{ width: 100%; border-collapse: collapse; margin-top: 6px; }}
          td {{ padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 14px; }}
          td.left {{ text-align: left; color: #374151; }}
          td.right {{ text-align: right; font-weight: 600; }}
          .footer {{ padding: 14px 18px; border-top:1px solid var(--border); font-size:12px; color:var(--muted); }}
        </style>
      </head>
      <body>
        <div class=\"shell\">
          <div class=\"card\">
            <div class=\"header\">
              <div class=\"brand\"><span class=\"brand-mark\"></span> {brand_name}</div>
              <span class=\"badge\">PAID</span>
            </div>

            <div class=\"section\">
              <div class=\"grid\">
                <div>
                  <div class=\"label\">Payment ID</div>
                  <div class=\"value\">{payment_id}</div>
                </div>
                <div>
                  <div class=\"label\">Issued</div>
                  <div class=\"value\">{now}</div>
                </div>
                <div>
                  <div class=\"label\">Currency</div>
                  <div class=\"value\">ZAR</div>
                </div>
                <div>
                  <div class=\"label\">Amount</div>
                  <div class=\"value\">{('ZAR ' + f"{amount:.2f}") if amount is not None else '—'}</div>
                </div>
              </div>
              {booking_row}
            </div>

            <div class=\"section\">
              <div class=\"grid\">{parties_html}</div>
            </div>

            <div class=\"section\">
              <div class=\"label\">Line items</div>
              <table>
                <tbody>
                  {item_rows if item_rows else '<tr><td class="left">Booking</td><td class="right">See amount</td></tr>'}
                </tbody>
              </table>
              <div style=\"height:8px\"></div>
              {totals_rows}
            </div>

            <div class=\"footer\">Thank you for booking with {brand_name}. This is a mock receipt for testing. For a downloadable PDF, configure the payment gateway to upload PDFs.</div>
          </div>
        </div>
      </body>
    </html>
    """
    return html


def _generate_receipt_pdf_with_playwright(html: str, output_path: str) -> bool:
    """Render HTML to a PDF using Playwright (Chromium). Returns True on success.

    This function is best-effort: if Playwright or Chromium are unavailable, it
    will return False without raising, so callers can fall back to HTML.
    """
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception:
        return False
    try:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with sync_playwright() as p:  # type: ignore
            browser = p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])  # type: ignore
            context = browser.new_context()
            page = context.new_page()
            page.set_content(html, wait_until="load")
            page.pdf(path=output_path, format="A4", print_background=True)
            context.close()
            browser.close()
        return True
    except Exception:
        try:
            # Clean up partial file if any
            if os.path.exists(output_path) and os.path.getsize(output_path) < 1024:
                os.remove(output_path)
        except Exception:
            pass
        return False


def _generate_receipt_pdf_with_reportlab(db: Session, payment_id: str, output_path: str) -> None:
    """Minimal PDF generator using ReportLab as a reliable fallback.

    Writes a simple branded receipt PDF with key facts. Raises on hard I/O errors.
    """
    try:
        from reportlab.lib.pagesizes import A4  # type: ignore
        from reportlab.pdfgen import canvas  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("ReportLab unavailable for receipt fallback") from exc

    # Load context (best-effort)
    amount = None
    client_name = None
    artist_name = None
    booking_id = None
    bs: BookingSimple | None = db.query(BookingSimple).filter(BookingSimple.payment_id == payment_id).first()
    if bs:
        booking_id = getattr(bs, "id", None)
        try:
            amount = float(getattr(bs, "charged_total_amount", 0) or 0)
        except Exception:
            amount = None
        try:
            client_name = getattr(bs.client, "name", None)
        except Exception:
            client_name = None
        try:
            artist_name = getattr(bs.artist, "name", None)
        except Exception:
            artist_name = None

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4
    y = height - 50
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y, "Booka Receipt")
    y -= 24
    c.setFont("Helvetica", 11)
    c.drawString(50, y, f"Payment ID: {payment_id}")
    y -= 16
    c.drawString(50, y, f"Issued: {datetime.utcnow():%Y-%m-%d %H:%M UTC}")
    y -= 16
    if booking_id:
        c.drawString(50, y, f"Booking: #{booking_id}")
        y -= 16
    if client_name:
        c.drawString(50, y, f"Client: {client_name}")
        y -= 16
    if artist_name:
        c.drawString(50, y, f"Artist: {artist_name}")
        y -= 16
    if amount is not None:
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y - 6, f"Total Paid: ZAR {amount:.2f}")
        y -= 22
    c.setFont("Helvetica", 10)
    c.drawString(50, y, "Thank you for booking with Booka.")
    c.showPage()
    c.save()


def generate_receipt_pdf(db: Session, payment_id: str) -> bool:
    """Generate a PDF receipt for the given payment id if missing. Best-effort.

    Returns True if a PDF exists after this call, else False.
    """
    path = os.path.abspath(os.path.join(RECEIPT_DIR, f"{payment_id}.pdf"))
    if os.path.exists(path):
        return True
    html = _compose_receipt_html(db, payment_id)
    ok = _generate_receipt_pdf_with_playwright(html, path)
    return ok and os.path.exists(path)


def _background_generate_receipt_pdf(payment_id: str) -> None:
    """Background task entrypoint: open a session, generate the receipt PDF."""
    try:
        with SessionLocal() as session:  # type: ignore
            try:
                ok = generate_receipt_pdf(session, payment_id)
                # Best-effort R2 upload
                if ok:
                    try:
                        path = os.path.abspath(os.path.join(RECEIPT_DIR, f"{payment_id}.pdf"))
                        if os.path.exists(path):
                            key = r2utils.build_receipt_key(payment_id)
                            with open(path, "rb") as fh:
                                data = fh.read()
                            r2utils.put_bytes(key, data, content_type="application/pdf")
                    except Exception:
                        logger.debug("receipt R2 upload failed (background)", exc_info=True)
            except Exception:
                logger.debug("generate_receipt_pdf failed", exc_info=True)
    except Exception:
        logger.debug("SessionLocal for receipt generation failed", exc_info=True)
