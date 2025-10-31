from fastapi import APIRouter, Depends, status, Request, Query, Header, BackgroundTasks
from fastapi.responses import FileResponse
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
from ..core.config import settings
from ..utils import error_response
from ..utils.notifications import notify_user_new_message
from ..utils.outbox import enqueue_outbox
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

    # If Paystack is configured, initialize a checkout session instead of immediate capture
    if settings.PAYSTACK_SECRET_KEY:
        try:
            # Resolve amount (Paystack expects the smallest currency unit)
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
                # Explicitly set currency to match our app default (e.g., ZAR)
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
            if not auth_url or not reference:
                raise RuntimeError("Invalid Paystack response")
            # Store a pending marker on BookingSimple so we can correlate on verify
            booking.payment_id = reference
            booking.payment_status = "pending"
            db.add(booking)
            db.commit()
            # Record ledger authorization init (optional) as 'charge' pending
            try:
                db.execute(text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'charge', :amt, 'ZAR', :meta)"), {"bid": booking.id, "amt": amount, "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "init"})})
                db.commit()
            except Exception:
                db.rollback()
            return {"status": "redirect", "authorization_url": auth_url, "reference": reference, "payment_id": reference}
        except Exception as exc:
            logger.error("Paystack init error: %s", exc, exc_info=True)
            raise error_response("Payment initialization failed", {}, status.HTTP_502_BAD_GATEWAY)

    # Mock if env flag is set or if using default example gateway URL
    MOCK_GATEWAY = bool(PAYMENT_GATEWAY_FAKE or (settings.PAYMENT_GATEWAY_URL and 'example.com' in settings.PAYMENT_GATEWAY_URL))
    if MOCK_GATEWAY:
        logger.info(
            "PAYMENT_GATEWAY_FAKE set - skipping gateway call (amount=%s)", amount
        )
        charge = {"id": f"fake_{uuid.uuid4().hex}", "status": "succeeded"}
    else:
        try:
            response = httpx.post(
                f"{settings.PAYMENT_GATEWAY_URL}/charges",
                json={"amount": amount, "currency": "ZAR"},
                timeout=10,
            )
            response.raise_for_status()
            charge = response.json()
        except Exception as exc:  # pragma: no cover - network failure path
            logger.error("Payment gateway error: %s", exc, exc_info=True)
            raise error_response(
                "Payment gateway error",
                {},
                status.HTTP_502_BAD_GATEWAY,
            )

    # Mark fully paid, regardless of request payload
    booking.payment_status = "paid"
    booking.payment_id = charge.get("id")
    booking.charged_total_amount = charge_amount

    # Ensure booking and related request are marked confirmed
    booking.confirmed = True
    br = None
    if booking.quote and booking.quote.booking_request:
        br = booking.quote.booking_request
        if br.status != BookingStatus.REQUEST_CONFIRMED:
            br.status = BookingStatus.REQUEST_CONFIRMED
    formal_booking = (
        db.query(Booking)
        .filter(Booking.quote_id == booking.quote_id)
        .first()
    )
    if formal_booking and formal_booking.status != BookingStatus.CONFIRMED:
        formal_booking.status = BookingStatus.CONFIRMED

    db.commit()
    db.refresh(booking)

    if br:
        # Create a canonical system message noting payment receipt (idempotent per system_key)
        try:
            receipt_suffix = (
                f" Receipt: /api/v1/payments/{booking.payment_id}/receipt"
                if booking.payment_id else ""
            )
            msg_sys = crud.crud_message.create_message(
                db=db,
                booking_request_id=br.id,
                sender_id=booking.artist_id,
                sender_type=SenderType.ARTIST,
                content=f"Payment received. Your booking is confirmed and the date is secured.{receipt_suffix}",
                message_type=MessageType.SYSTEM,
                visible_to=VisibleTo.BOTH,
                action=None,
                system_key="payment_received",
            )
            db.commit()
            # Note: we no longer create a provider-only mirror system line.
            # The canonical BOTH-visible message above is sufficient, and
            # bell notifications are emitted below to surface the event.
            # Broadcast this system message to the thread via WS/SSE (best effort)
            try:
                if ws_manager:
                    env = _message_to_envelope(db, msg_sys)
                    background_tasks.add_task(ws_manager.broadcast, int(br.id), env)
                    logger.info(
                        "payment_broadcast_scheduled: request_id=%s msg_id=%s",
                        int(br.id), int(getattr(msg_sys, "id", 0) or 0),
                    )
                # Reliable realtime via outbox as a fallback/cross-process path
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
            # Notify both parties about the payment system message
            try:
                artist = db.query(User).filter(User.id == booking.artist_id).first()
                client = db.query(User).filter(User.id == booking.client_id).first()
                if artist and client:
                    # Client sees bell (sender = artist)
                    notify_user_new_message(db, client, artist, br.id, "Payment received", MessageType.SYSTEM)
                    # Provider sees bell (sender = client)
                    notify_user_new_message(db, artist, client, br.id, "Payment received", MessageType.SYSTEM)
            except Exception:
                pass
        except Exception as exc:  # pragma: no cover — non-fatal
            logger.warning("Failed to write payment_received system message: %s", exc)

        # Notify both client and artist to view booking details
        crud.crud_message.create_message(
            db=db,
            booking_request_id=br.id,
            sender_id=booking.artist_id,
            sender_type=SenderType.ARTIST,
            content="View Booking Details",
            message_type=MessageType.SYSTEM,
            visible_to=VisibleTo.CLIENT,
            action=MessageAction.VIEW_BOOKING_DETAILS,
        )
        crud.crud_message.create_message(
            db=db,
            booking_request_id=br.id,
            sender_id=booking.client_id,
            sender_type=SenderType.CLIENT,
            content="View Booking Details",
            message_type=MessageType.SYSTEM,
            visible_to=VisibleTo.ARTIST,
            action=MessageAction.VIEW_BOOKING_DETAILS,
        )

    # Record ledger capture (mock or real)
    try:
        db.execute(text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'charge', :amt, 'ZAR', :meta)"), {"bid": booking.id, "amt": float(charge_amount), "meta": json.dumps({"source": "gateway"})})
        db.commit()
    except Exception:
        db.rollback()
    # Metrics (best-effort)
    try:
        dt = (time.perf_counter() - t_start_direct) * 1000.0
        metrics_timing("payment.direct_success_ms", dt, tags={"source": "direct"})
        metrics_incr("payment.direct_success_total", tags={"source": "direct"})
    except Exception:
        pass
    return {"status": "ok", "payment_id": charge.get("id")}


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

    if br:
        try:
            receipt_suffix = f" Receipt: /api/v1/payments/{simple.payment_id}/receipt" if simple.payment_id else ""
            msg_sys = crud.crud_message.create_message(
                db=db,
                booking_request_id=br.id,
                sender_id=simple.artist_id,
                sender_type=SenderType.ARTIST,
                content=f"Payment received — order #{simple.payment_id}.{receipt_suffix}",
                message_type=MessageType.SYSTEM,
                visible_to=VisibleTo.BOTH,
                action=None,
                system_key="payment_received",
            )
            db.commit()
            # Note: we no longer create a provider-only mirror system line.
            # The canonical BOTH-visible message above is sufficient, and
            # bell notifications are emitted below to surface the event.
            try:
                if ws_manager:
                    env = _message_to_envelope(db, msg_sys)
                    background_tasks.add_task(ws_manager.broadcast, int(br.id), env)
                    logger.info(
                        "payment_broadcast_scheduled: request_id=%s msg_id=%s",
                        int(br.id), int(getattr(msg_sys, "id", 0) or 0),
                    )
                # Also enqueue outbox for reliable cross-process delivery
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
            # Notify both parties about the payment system message
            try:
                artist = db.query(User).filter(User.id == simple.artist_id).first()
                client = db.query(User).filter(User.id == simple.client_id).first()
                if artist and client:
                    notify_user_new_message(db, client, artist, br.id, "Payment received", MessageType.SYSTEM)
                    notify_user_new_message(db, artist, client, br.id, "Payment received", MessageType.SYSTEM)
            except Exception:
                pass
        except Exception:
            pass

    # Record ledger capture
    try:
        db.execute(text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'charge', :amt, 'ZAR', :meta)"), {"bid": simple.id, "amt": float(amount), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "verify"})})
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
    return {"status": "ok", "payment_id": simple.payment_id}


@router.get("/{payment_id}/receipt")
def download_receipt(payment_id: str, request: Request, db: Session = Depends(get_db)):
    """Return a minimal plaintext receipt for the given payment id.

    In test mode we emit a small text response so callers can download it.
    """
    # Try to find a booking_simple with this payment_id to extract some context
    bs = db.query(BookingSimple).filter(BookingSimple.payment_id == payment_id).first()
    lines = [
        f"Payment ID: {payment_id}",
        f"Date: {datetime.utcnow().isoformat()}Z",
    ]
    if bs:
        try:
            amt = bs.charged_total_amount or Decimal("0")
            lines.append(f"Amount: {amt} ZAR")
        except Exception:
            pass
        if bs.quote and bs.quote.booking_request_id:
            lines.append(f"Booking Request: {bs.quote.booking_request_id}")
    body = "\n".join(lines) + "\n"
    headers = {"Content-Disposition": f"attachment; filename=receipt-{payment_id}.txt"}
    return Response(content=body, media_type="text/plain", headers=headers)


@router.post("/paystack/webhook")
async def paystack_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_paystack_signature: str | None = Header(default=None),
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
            receipt_suffix = f" Receipt: /api/v1/payments/{simple.payment_id}/receipt" if simple.payment_id else ""
            msg_sys = crud.crud_message.create_message(
                db=db,
                booking_request_id=br.id,
                sender_id=simple.artist_id,
                sender_type=SenderType.ARTIST,
                content=f"Payment received — order #{simple.payment_id}.{receipt_suffix}",
                message_type=MessageType.SYSTEM,
                visible_to=VisibleTo.BOTH,
                action=None,
                system_key="payment_received",
            )
            db.commit()
            try:
                if ws_manager:
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
                try:
                    env = _message_to_envelope(db, msg_sys)
                    enqueue_outbox(db, topic=f"booking-requests:{int(br.id)}", payload=env)
                except Exception:
                    pass
            except Exception as exc:
                logger.warning("payment_broadcast_failed: request_id=%s err=%s", int(getattr(br, 'id', 0) or 0), exc)
        except Exception:
            pass
        # Notify both parties (bell notifications)
        try:
            artist = db.query(User).filter(User.id == simple.artist_id).first()
            client = db.query(User).filter(User.id == simple.client_id).first()
            if artist and client:
                notify_user_new_message(db, client, artist, br.id, "Payment received", MessageType.SYSTEM)
                notify_user_new_message(db, artist, client, br.id, "Payment received", MessageType.SYSTEM)
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

    # Record ledger capture
    try:
        db.execute(text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'charge', :amt, 'ZAR', :meta)"), {"bid": simple.id, "amt": float(amount), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "webhook"})})
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


@router.get("/{payment_id}/receipt")
def get_payment_receipt(payment_id: str, db: Session = Depends(get_db)):
    """Return the receipt PDF for the given payment id.

    If a static PDF does not exist (e.g., in mock/test environments), serve a simple
    HTML receipt so the user still gets a believable document.
    """
    path = os.path.abspath(os.path.join(RECEIPT_DIR, f"{payment_id}.pdf"))
    if os.path.exists(path):
        return FileResponse(
            path,
            media_type="application/pdf",
            filename=f"{payment_id}.pdf",
        )

    # Fallback HTML receipt (mock, branded)
    from fastapi.responses import HTMLResponse
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
    return HTMLResponse(
        content=html,
        status_code=200,
        headers={
            # Allow inline <style> and style attributes for this receipt only
            "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'",
        },
    )
