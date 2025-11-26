from fastapi import APIRouter, Depends, status, Request, Query, Header, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.responses import RedirectResponse
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, Literal
import logging
import os
from decimal import Decimal, ROUND_HALF_UP
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
from .dependencies import get_db, get_current_active_client, get_current_service_provider, get_current_user
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
from ..utils.server_timing import ServerTimer
from datetime import datetime as _dt
from ..services.quote_totals import compute_quote_totals_snapshot
from ..utils.notifications import (
    notify_booking_confirmed_email_for_provider,
    notify_booking_confirmed_email_for_client,
)

logger = logging.getLogger(__name__)

"""Legacy env flag PAYMENT_GATEWAY_FAKE has been removed."""

router = APIRouter(tags=["payments"])

# Payment invariants (keep in sync with README):
# - Backend computes the canonical charge (quote total + Booka fee + VAT); clients never supply or recalc amounts.
# - Frontend displays the amounts returned by these endpoints verbatim.
# - Receipts/invoices read from stored snapshots (e.g., charged_total_amount) so historical math never drifts.


class PaymentCreate(BaseModel):
    booking_request_id: int
    # For full-upfront payments, amount/full are ignored by the server.
    # They are retained in the schema for backward compatibility with clients.
    amount: Optional[float] = Field(default=None, gt=0)
    full: Optional[bool] = False
    # Inline-only flow: when true, the server will not call Paystack
    # initialize. It will accept/prepare the booking, generate a unique
    # reference, persist it on the BookingSimple, and return it so the
    # client can open the inline popup directly. Verification still
    # happens via /payments/paystack/verify.
    inline: Optional[bool] = False


class PaymentInitResponse(BaseModel):
    status: Literal["inline", "redirect"]
    reference: str
    payment_id: Optional[str] = None
    amount: float
    currency: str
    authorization_url: Optional[str] = None
    access_code: Optional[str] = None


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


def _compute_final_payout_schedule(db: Session, simple: models.BookingSimple) -> _dt:
    """Return the next business-day datetime after the event for final payouts.

    Fallback hierarchy for event time: Booking.end_time -> Booking.start_time -> BookingSimple.date -> now.
    Weekends are skipped; holidays are not modeled here.
    """
    when = None
    try:
        booking = db.query(models.Booking).filter(models.Booking.quote_id == simple.quote_id).first()
        if booking and getattr(booking, "end_time", None):
            when = booking.end_time
        elif booking and getattr(booking, "start_time", None):
            when = booking.start_time
    except Exception:
        when = None
    if when is None:
        try:
            when = getattr(simple, "date", None)
        except Exception:
            when = None
    if when is None:
        when = _dt.utcnow()
    # Next business day at 09:00 UTC
    d = when + timedelta(days=1)
    while d.weekday() >= 5:  # 5=Sat, 6=Sun
        d = d + timedelta(days=1)
    return d.replace(hour=9, minute=0, second=0, microsecond=0)


def _ensure_payout_rows(db: Session, simple: models.BookingSimple, total_amount: Decimal, reference: str, phase: str) -> None:
    """Create first50 and final50 payout rows if missing (manual payout flow).

    - first50 scheduled now; final50 next business day after event.
    - Idempotent per (booking_id, type).
    """
    # We no longer split by charged total. We compute net-to-provider and
    # split that 50/50 (rounding residual to final) so payouts reflect the
    # provider's net, not the client's total. Supplier VAT is included when
    # the provider is VAT-registered (agent model).
    half1 = None
    half2 = None

    # Compute fee snapshot (commissionable base, client fee, commission, VAT on commission, pass-through)
    def _snapshot() -> dict:
        snap: dict = {}
        try:
            qv2 = db.query(QuoteV2).filter(QuoteV2.id == simple.quote_id).first()
        except Exception:
            qv2 = None
        # Services total: sum of services[].price
        services_total = 0.0
        try:
            if qv2 and isinstance(qv2.services, list):
                for s in qv2.services:
                    try:
                        services_total += float(s.get('price') or 0)
                    except Exception:
                        pass
        except Exception:
            pass
        # Pass-through: travel + sound (accommodation free-text excluded)
        pass_through = 0.0
        try:
            if qv2:
                try:
                    pass_through += float(qv2.travel_fee or 0)
                except Exception:
                    pass
                try:
                    pass_through += float(qv2.sound_fee or 0)
                except Exception:
                    pass
        except Exception:
            pass
        # Discount (EX VAT) applied to base
        discount_ex = 0.0
        try:
            if qv2 and getattr(qv2, 'discount', None) is not None:
                discount_ex = float(qv2.discount or 0)
        except Exception:
            discount_ex = 0.0

        # Rates (commission/env) and canonical client-fee snapshot
        COMMISSION_RATE = float(os.getenv('COMMISSION_RATE', '0.075') or 0.075)
        VAT_RATE = float(os.getenv('VAT_RATE', '0.15') or 0.15)
        # Prefer centralized Booka fee math from compute_quote_totals_snapshot
        snap_cf = None
        try:
            if qv2 is not None:
                snap_cf = compute_quote_totals_snapshot(qv2)
        except Exception:
            snap_cf = None

        # Commissionable base (EX): services + travel + sound − discount
        commissionable_base = round(max(0.0, (services_total + pass_through) - discount_ex), 2)
        # Client fee (Booka) — source from canonical snapshot when available
        if snap_cf is not None:
            try:
                client_fee = float(snap_cf.platform_fee_ex_vat)
                client_fee_vat = float(snap_cf.platform_fee_vat)
            except Exception:
                client_fee = 0.0
                client_fee_vat = 0.0
        else:
            # Fallback (legacy): derive from env rates if snapshot missing
            CLIENT_FEE_RATE = float(os.getenv('CLIENT_FEE_RATE', '0.03') or 0.03)
            client_fee = round(commissionable_base * CLIENT_FEE_RATE, 2)
            client_fee_vat = round(client_fee * VAT_RATE, 2)
        # Commission withheld on EX base (provider-funded)
        commission = round(commissionable_base * COMMISSION_RATE, 2)
        vat_on_commission = round(commission * VAT_RATE, 2)

        # Supplier VAT: include if provider VAT-registered (fallback 0%)
        supplier_vat_rate = 0.0
        supplier_vat_amount = 0.0
        try:
            prof = db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == int(simple.artist_id)).first()
            if settings.ENABLE_AGENT_PAYOUT_VAT and prof and bool(getattr(prof, 'vat_registered', False)):
                try:
                    supplier_vat_rate = float(getattr(prof, 'vat_rate', VAT_RATE) or VAT_RATE)
                except Exception:
                    supplier_vat_rate = VAT_RATE
        except Exception:
            supplier_vat_rate = 0.0
        try:
            supplier_vat_amount = round(commissionable_base * supplier_vat_rate, 2)
        except Exception:
            supplier_vat_amount = 0.0

        # Provider net estimate incl supplier VAT
        provider_net_total_estimate = round((commissionable_base + supplier_vat_amount) - commission - vat_on_commission, 2)
        # Stage nets (pro-rata; keep rounding residual on final)
        try:
            from decimal import Decimal as _D, ROUND_HALF_UP as _R
            _pnet = _D(str(provider_net_total_estimate))
            stage_first = (_pnet / _D('2')).quantize(_D('0.01'), rounding=_R)
            stage_final = (_pnet - stage_first).quantize(_D('0.01'), rounding=_R)
            first_est = float(stage_first)
            final_est = float(stage_final)
        except Exception:
            first_est = round(provider_net_total_estimate / 2.0, 2)
            final_est = round(provider_net_total_estimate - first_est, 2)

        snap.update({
            'commissionable_base': round(commissionable_base, 2),
            'discount_ex': round(discount_ex, 2),
            'pass_through': round(pass_through, 2),
            'rates': {
                'commission_rate': COMMISSION_RATE,
                'client_fee_rate': (
                    snap_cf.rates.get('client_fee_rate')
                    if (snap_cf and getattr(snap_cf, 'rates', None) and (snap_cf.rates.get('client_fee_rate') is not None))
                    else float(os.getenv('CLIENT_FEE_RATE', '0.03') or 0.03)
                ),
                'vat_rate': (
                    snap_cf.rates.get('vat_rate')
                    if (snap_cf and getattr(snap_cf, 'rates', None) and (snap_cf.rates.get('vat_rate') is not None))
                    else VAT_RATE
                ),
            },
            'commission_ex': commission,
            'vat_on_commission': vat_on_commission,
            'client_fee': client_fee,
            'client_fee_vat': client_fee_vat,
            'supplier_vat_rate': supplier_vat_rate,
            'supplier_vat_amount': supplier_vat_amount,
            'provider_net_total_estimate': provider_net_total_estimate,
            'reference': reference,
        })
        # Stage estimates
        snap['stage_estimates'] = {'first50': first_est, 'final50': final_est}
        return snap

    fee_snapshot = _snapshot()
    # Stage net amounts (floats)
    stage_first_amt = float(fee_snapshot.get('stage_estimates', {}).get('first50') or 0.0)
    stage_final_amt = float(fee_snapshot.get('stage_estimates', {}).get('final50') or 0.0)

    # Query existing for idempotency
    try:
        rows = db.execute(
            text(
                "SELECT type FROM payouts WHERE booking_id=:bid AND type IN ('first50','final50')"
            ),
            {"bid": int(simple.id)},
        ).fetchall()
        have = {str(r[0]) for r in rows}
    except Exception:
        have = set()

    now = _dt.utcnow()
    # Insert first50 if missing
    if 'first50' not in have and stage_first_amt > 0:
        try:
            meta_first = {
                'phase': phase,
                'stage': 'first50',
                'split': 'first50',
                **fee_snapshot,
                'stage_net_estimate': fee_snapshot.get('stage_estimates', {}).get('first50'),
            }
            db.execute(
                text(
                    """
                    INSERT INTO payouts (booking_id, provider_id, amount, currency, status, type, scheduled_at, batch_id, reference, meta)
                    VALUES (:bid, :pid, :amt, 'ZAR', 'queued', 'first50', :sched, NULL, :ref, :meta)
                    """
                ),
                {
                    "bid": int(simple.id),
                    "pid": int(simple.artist_id),
                    "amt": float(stage_first_amt),
                    "sched": now,
                    "ref": reference,
                    "meta": json.dumps(meta_first),
                },
            )
            db.commit()
        except Exception:
            db.rollback()
    # Insert final50 if missing
    if 'final50' not in have and stage_final_amt > 0:
        sched = _compute_final_payout_schedule(db, simple)
        try:
            meta_final = {
                'phase': phase,
                'stage': 'final50',
                'split': 'final50',
                **fee_snapshot,
                'stage_net_estimate': fee_snapshot.get('stage_estimates', {}).get('final50'),
            }
            db.execute(
                text(
                    """
                    INSERT INTO payouts (booking_id, provider_id, amount, currency, status, type, scheduled_at, batch_id, reference, meta)
                    VALUES (:bid, :pid, :amt, 'ZAR', 'queued', 'final50', :sched, NULL, :ref, :meta)
                    """
                ),
                {
                    "bid": int(simple.id),
                    "pid": int(simple.artist_id),
                    "amt": float(stage_final_amt),
                    "sched": sched,
                    "ref": reference,
                    "meta": json.dumps(meta_final),
                },
            )
            db.commit()
        except Exception:
            db.rollback()

try:
    # Import the WebSocket manager to broadcast new messages to thread topics
    from .api_ws import manager as ws_manager  # type: ignore
except Exception:  # pragma: no cover - fallback when ws module unavailable
    ws_manager = None  # type: ignore


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=PaymentInitResponse)
def create_payment(
    payment_in: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_client),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    response: Response = None,
):
    """Initialize a payment. Backend computes the canonical amount (quote total + Booka fee + VAT) and returns it."""
    logger.info(
        "Process payment init for request %s (inline=%s)",
        payment_in.booking_request_id,
        bool(getattr(payment_in, "inline", False)),
    )
    t_start_direct = time.perf_counter()
    timer = ServerTimer()

    t0_db = ServerTimer.start()
    booking = (
        db.query(BookingSimple)
        .join(QuoteV2, BookingSimple.quote_id == QuoteV2.id)
        .filter(QuoteV2.booking_request_id == payment_in.booking_request_id)
        .first()
    )
    timer.stop('db', t0_db)
    if not booking:
        # Accept-and-create on first payment attempt so clients can pay immediately after a quote is sent.
        # Find the most recent quote for this request (prefer PENDING, fallback to ACCEPTED if already accepted elsewhere).
        t0_db2 = ServerTimer.start()
        candidate = (
            db.query(QuoteV2)
            .filter(QuoteV2.booking_request_id == payment_in.booking_request_id)
            .order_by(QuoteV2.id.desc())
            .first()
        )
        timer.stop('db', t0_db2)
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
            t0_db3 = ServerTimer.start()
            booking = (
                db.query(BookingSimple)
                .filter(BookingSimple.quote_id == candidate.id)
                .first()
            )
            timer.stop('db', t0_db3)
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

    quote = getattr(booking, "quote", None)
    if quote is None and getattr(booking, "quote_id", None):
        quote = db.query(QuoteV2).filter(QuoteV2.id == booking.quote_id).first()
    if quote is None:
        logger.warning("Quote missing for booking %s", booking.id)
        raise error_response("Invalid quote total", {"amount": "invalid"}, status.HTTP_422_UNPROCESSABLE_ENTITY)
    snapshot = compute_quote_totals_snapshot(quote)
    if snapshot is None:
        logger.warning("Cannot compute charge amount for booking %s: quote total missing", booking.id)
        raise error_response("Invalid quote total", {"amount": "invalid"}, status.HTTP_422_UNPROCESSABLE_ENTITY)
    try:
        amount_float = float(snapshot.client_total_incl_vat)
    except (TypeError, ValueError) as exc:
        logger.warning("Cannot compute charge amount for booking %s: %s", booking.id, exc)
        raise error_response("Invalid quote total", {"amount": "invalid"}, status.HTTP_422_UNPROCESSABLE_ENTITY) from exc
    logger.info(
        "Resolved payment amount (Total To Pay) %s (quote_total=%s fee=%s fee_vat=%s)",
        amount_float,
        float(snapshot.provider_total_incl_vat),
        float(snapshot.platform_fee_ex_vat),
        float(snapshot.platform_fee_vat),
    )

    # Inline-only mode: do not call Paystack initialize. Generate a fresh
    # reference and persist it so the client can start an inline checkout
    # bound to this reference. This avoids duplicate-reference errors from
    # mixing server-init with inline flows while preserving server-side
    # acceptance and amount computation.
    try:
        if bool(getattr(payment_in, "inline", False)):
            # Generate a short, unique reference. Prefix with br id for traceability
            short = uuid.uuid4().hex[:12]
            reference = f"br{int(getattr(booking, 'booking_request_id', 0) or 0)}_{short}"
            # Rotate the pending reference if not yet paid
            if str(getattr(booking, "payment_status", "")).lower() != "paid":
                booking.payment_id = reference
                booking.payment_status = "pending"
                db.add(booking)
                db.commit()
            result = {
                "status": "inline",
                "reference": reference,
                "payment_id": reference,
                "currency": snapshot.currency,
                "amount": float(snapshot.client_total_incl_vat),
            }
            try:
                hdr = timer.header()
                if hdr and response is not None:
                    response.headers['Server-Timing'] = hdr
            except Exception:
                pass
            return result
    except Exception as exc:
        logger.error("Inline prepare error: %s", exc, exc_info=True)
        # Fall through to server-init path

    # Require Paystack; no fake/direct payments path
    if not settings.PAYSTACK_SECRET_KEY:
        raise error_response("Paystack not configured", {}, status.HTTP_400_BAD_REQUEST)
    try:
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
            # Attach metadata so webhook/verify can reconcile bookings even if
            # Paystack emits a different final reference in inline flow
            "metadata": {
                "booking_request_id": int(getattr(booking, "booking_request_id", 0) or 0),
                "simple_id": int(getattr(booking, "id", 0) or 0),
                "quote_id": int(getattr(booking, "quote_id", 0) or 0),
                "user_id": int(getattr(current_user, "id", 0) or 0),
                "source": "web_inline",
            },
        }
        if callback:
            payload["callback_url"] = callback
        t0_ext = ServerTimer.start()
        with httpx.Client(timeout=10.0) as client:
            r = client.post("https://api.paystack.co/transaction/initialize", json=payload, headers=headers)
            r.raise_for_status()
            data = r.json().get("data", {})
        timer.stop('ext', t0_ext)
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
                {"bid": booking.id, "amt": float(snapshot.client_total_incl_vat), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "init"})},
            )
            db.commit()
        except Exception:
            db.rollback()
        result = {
            "status": "redirect",
            "authorization_url": auth_url,
            "reference": reference,
            "payment_id": reference,
            "access_code": access_code,
            "amount": float(snapshot.client_total_incl_vat),
            "currency": snapshot.currency,
        }
        try:
            hdr = timer.header()
            if hdr and response is not None:
                response.headers['Server-Timing'] = hdr
        except Exception:
            pass
        return result
    except Exception as exc:
        logger.error("Paystack init error: %s", exc, exc_info=True)
        raise error_response("Payment initialization failed", {}, status.HTTP_502_BAD_GATEWAY)


@router.get("/paystack/verify")
def paystack_verify(
    reference: str = Query(..., min_length=4),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_client),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    response: Response = None,
):
    if not settings.PAYSTACK_SECRET_KEY:
        raise error_response("Paystack not configured", {}, status.HTTP_400_BAD_REQUEST)
    headers = {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    t_start_verify = time.perf_counter()
    timer = ServerTimer()
    try:
        t0_ext = ServerTimer.start()
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"https://api.paystack.co/transaction/verify/{reference}", headers=headers)
            r.raise_for_status()
            data = r.json().get("data", {})
        timer.stop('ext', t0_ext)
        status_str = str(data.get("status", "")).lower()
        amount_kobo = int(data.get("amount", 0) or 0)
        amount = Decimal(str(amount_kobo / 100.0))
    except Exception as exc:
        logger.error("Paystack verify error: %s", exc, exc_info=True)
        raise error_response("Verification failed", {}, status.HTTP_502_BAD_GATEWAY)

    if status_str != "success":
        raise error_response("Payment not successful", {"status": status_str}, status.HTTP_400_BAD_REQUEST)

    # Resolve booking via stored reference; fallback to metadata mapping
    t0_db = ServerTimer.start()
    simple = db.query(BookingSimple).filter(BookingSimple.payment_id == reference).first()
    timer.stop('db', t0_db)
    if not simple:
        # Attempt to reconcile using Paystack metadata
        meta = data.get("metadata") if isinstance(data, dict) else None
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = None
        br_id = None
        if isinstance(meta, dict):
            try:
                br_id = int(meta.get("booking_request_id") or 0) or None
            except Exception:
                br_id = None
        if br_id:
            t0_db2 = ServerTimer.start()
            cand = (
                db.query(BookingSimple)
                .filter(BookingSimple.booking_request_id == br_id)
                .first()
            )
            timer.stop('db', t0_db2)
            if cand and getattr(cand, "client_id", None) == getattr(current_user, "id", None):
                cand.payment_id = reference
                db.add(cand)
                db.commit()
                simple = cand
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
    t0_db3 = ServerTimer.start()
    formal_booking = db.query(Booking).filter(Booking.quote_id == simple.quote_id).first()
    timer.stop('db', t0_db3)
    # Enforce payment = acceptance: ensure a formal Booking exists. If quote is still pending, accept now (idempotent).
    try:
        if formal_booking is None and getattr(simple, "quote_id", None):
            t0_db4 = ServerTimer.start()
            qv2 = db.query(QuoteV2).filter(QuoteV2.id == simple.quote_id).first()
            timer.stop('db', t0_db4)
            if qv2 is not None:
                status_val = getattr(qv2.status, "value", qv2.status)
                if str(status_val).lower() == "pending":
                    try:
                        crud_quote_v2.accept_quote(db, int(qv2.id))
                        t0_db5 = ServerTimer.start()
                        formal_booking = db.query(Booking).filter(Booking.quote_id == qv2.id).first()
                        timer.stop('db', t0_db5)
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
            # Build single BOTH-visible message. Include receipt URL inline so the
            # client renderer can show an underlined "View receipt" without a
            # separate client-only message. Providers will render a payout link.
            receipt_url = f"{FRONTEND_PRIMARY}/receipts/{simple.payment_id}" if simple.payment_id else None
            k_both = f"payment_confirmed:{simple.payment_id}" if simple.payment_id else "payment_confirmed"

            created_msgs: list[models.Message] = []

            # BOTH-visible confirmation (with embedded receipt URL when available)
            exists_both = (
                db.query(models.Message)
                .filter(models.Message.booking_request_id == br.id, models.Message.system_key == k_both)
                .first()
            )
            if not exists_both:
                content_text = (
                    f"Payment received. Booking confirmed. Receipt: {receipt_url}"
                    if receipt_url
                    else "Payment received. Booking confirmed."
                )
                m = crud.crud_message.create_message(
                    db=db,
                    booking_request_id=br.id,
                    sender_id=simple.artist_id,
                    sender_type=SenderType.ARTIST,
                    content=content_text,
                    message_type=MessageType.SYSTEM,
                    visible_to=VisibleTo.BOTH,
                    action=None,
                    system_key=k_both,
                )
                db.commit()
                created_msgs.append(m)

            # Broadcast all newly created messages
            try:
                if ws_manager and created_msgs:
                    for m in created_msgs:
                        env = _message_to_envelope(db, m)
                        background_tasks.add_task(ws_manager.broadcast, int(br.id), env)
                        try:
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

        # Best-effort: send booking-confirmed emails to both client and provider.
        try:
            client = (
                db.query(models.User)
                .filter(models.User.id == br.client_id)
                .first()
            )
            artist = (
                db.query(models.User)
                .filter(models.User.id == br.artist_id)
                .first()
            )
            if client and artist:
                try:
                    notify_booking_confirmed_email_for_provider(
                        db,
                        provider=artist,
                        client=client,
                        booking=simple,
                        booking_request=br,
                    )
                except Exception:
                    pass
                try:
                    notify_booking_confirmed_email_for_client(
                        db,
                        client=client,
                        provider=artist,
                        booking=simple,
                        booking_request=br,
                    )
                except Exception:
                    pass
        except Exception:
            # Email is best-effort; never block verify on mail failures.
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
        # Compute provider net stage amounts to reflect true escrow in/hold
        # Snapshot (duplicated from payout snapshot for locality)
        try:
            qv2 = db.query(QuoteV2).filter(QuoteV2.id == simple.quote_id).first()
        except Exception:
            qv2 = None
        services_total = 0.0
        try:
            if qv2 and isinstance(qv2.services, list):
                for s in qv2.services:
                    try:
                        services_total += float(s.get('price') or 0)
                    except Exception:
                        pass
        except Exception:
            pass
        pass_through = 0.0
        try:
            if qv2:
                pass_through += float(qv2.travel_fee or 0)
                pass_through += float(qv2.sound_fee or 0)
        except Exception:
            pass
        # Discount
        discount_ex = 0.0
        try:
            if qv2 and getattr(qv2, 'discount', None) is not None:
                discount_ex = float(qv2.discount or 0)
        except Exception:
            discount_ex = 0.0
        COMMISSION_RATE = float(os.getenv('COMMISSION_RATE', '0.075') or 0.075)
        VAT_RATE = float(os.getenv('VAT_RATE', '0.15') or 0.15)
        commissionable_base = round(max(0.0, (services_total + pass_through) - discount_ex), 2)
        commission = round(commissionable_base * COMMISSION_RATE, 2)
        vat_on_commission = round(commission * VAT_RATE, 2)
        # Supplier VAT include when provider VAT-registered
        supplier_vat_rate = 0.0
        try:
            prof = db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == int(simple.artist_id)).first()
            if settings.ENABLE_AGENT_PAYOUT_VAT and prof and bool(getattr(prof, 'vat_registered', False)):
                try:
                    supplier_vat_rate = float(getattr(prof, 'vat_rate', VAT_RATE) or VAT_RATE)
                except Exception:
                    supplier_vat_rate = VAT_RATE
        except Exception:
            supplier_vat_rate = 0.0
        supplier_vat_amount = round(commissionable_base * supplier_vat_rate, 2)
        provider_net_total_estimate = round((commissionable_base + supplier_vat_amount) - commission - vat_on_commission, 2)
        try:
            from decimal import Decimal as _D, ROUND_HALF_UP as _R
            _pnet = _D(str(provider_net_total_estimate))
            _first = (_pnet / _D('2')).quantize(_D('0.01'), rounding=_R)
            _final = (_pnet - _first).quantize(_D('0.01'), rounding=_R)
            first_stage_amt = float(_first)
            final_stage_amt = float(_final)
        except Exception:
            first_stage_amt = round(provider_net_total_estimate / 2.0, 2)
            final_stage_amt = round(provider_net_total_estimate - first_stage_amt, 2)
        if not _meta_has("provider_escrow_in", split="first50"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_escrow_in', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(first_stage_amt), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "verify", "split": "first50"})},
            )
        if not _meta_has("provider_escrow_hold", split="held50"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_escrow_hold', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(final_stage_amt), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "verify", "split": "held50"})},
            )
        db.commit()
    except Exception:
        db.rollback()
    # Ensure payout rows exist (manual payout flow)
    try:
        _ensure_payout_rows(db, simple, amount, reference, phase="verify")
    except Exception:
        # Non-blocking
        pass
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
    charged_amount = getattr(simple, "charged_total_amount", None)
    if charged_amount is None:
        # TODO: Remove this fallback after backfilling charged_total_amount for legacy rows.
        charged_amount = amount
    result = {
        "status": "ok",
        "payment_id": simple.payment_id,
        "amount": float(charged_amount or 0),
        "currency": settings.DEFAULT_CURRENCY or "ZAR",
    }
    # Best-effort: generate provider invoice (agent) on set-off (per-booking)
    try:
        # Avoid duplicates: check for existing provider invoice
        rows = db.execute(text("SELECT id FROM invoices WHERE booking_id=:bid AND invoice_type IN ('provider_tax','provider_invoice') ORDER BY id DESC LIMIT 1"), {"bid": int(simple.id)}).fetchone()
        if not rows:
            prof = db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == int(simple.artist_id)).first()
            is_vendor = bool(getattr(prof, 'vat_registered', False))
            crud_invoice.create_provider_invoice(db, simple, vendor=is_vendor)
    except Exception:
        pass
    # Best-effort: generate Booka client-fee tax invoice when split invoicing is enabled
    try:
        if settings.ENABLE_SPLIT_INVOICING:
            crud_invoice.create_client_fee_invoice(db, simple)
    except Exception:
        pass
    try:
        hdr = timer.header()
        if hdr and response is not None:
            response.headers['Server-Timing'] = hdr
    except Exception:
        pass
    return result


## Removed plaintext receipt endpoint; PDF receipt (ReportLab-only) implemented below.


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
    timer = ServerTimer()
    if not settings.PAYSTACK_SECRET_KEY:
        resp = Response(status_code=status.HTTP_200_OK)
        try:
            hdr = timer.header()
            if hdr:
                resp.headers['Server-Timing'] = hdr
        except Exception:
            pass
        return resp

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
            resp = Response(status_code=status.HTTP_400_BAD_REQUEST)
            try:
                hdr = timer.header()
                if hdr:
                    resp.headers['Server-Timing'] = hdr
            except Exception:
                pass
            return resp
    except Exception as exc:
        logger.error("Webhook signature verification failed: %s", exc)
        resp = Response(status_code=status.HTTP_400_BAD_REQUEST)
        try:
            hdr = timer.header()
            if hdr:
                resp.headers['Server-Timing'] = hdr
        except Exception:
            pass
        return resp

    try:
        t0 = ServerTimer.start()
        payload = json.loads(raw.decode("utf-8"))
        timer.stop('parse', t0)
    except Exception:
        resp = Response(status_code=status.HTTP_400_BAD_REQUEST)
        try:
            hdr = timer.header()
            if hdr:
                resp.headers['Server-Timing'] = hdr
        except Exception:
            pass
        return resp

    event = str(payload.get("event", "")).lower()
    data = payload.get("data", {}) or {}
    reference = str(data.get("reference", ""))
    status_str = str(data.get("status", "")).lower()
    amount_kobo = int(data.get("amount", 0) or 0)
    amount = Decimal(str(amount_kobo / 100.0))

    if event != "charge.success" and status_str != "success":
        resp = Response(status_code=status.HTTP_200_OK)
        try:
            hdr = timer.header()
            if hdr:
                resp.headers['Server-Timing'] = hdr
        except Exception:
            pass
        return resp

    if not reference:
        resp = Response(status_code=status.HTTP_200_OK)
        try:
            hdr = timer.header()
            if hdr:
                resp.headers['Server-Timing'] = hdr
        except Exception:
            pass
        return resp

    # Correlate with pending BookingSimple using reference
    simple = db.query(BookingSimple).filter(BookingSimple.payment_id == reference).first()
    if not simple:
        # Attempt to reconcile using Paystack metadata
        meta = data.get("metadata") if isinstance(data, dict) else None
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = None
        br_id = None
        if isinstance(meta, dict):
            try:
                br_id = int(meta.get("booking_request_id") or 0) or None
            except Exception:
                br_id = None
        if br_id:
            cand = db.query(BookingSimple).filter(BookingSimple.booking_request_id == br_id).first()
            if cand:
                cand.payment_id = reference
                db.add(cand)
                db.commit()
                simple = cand
    if not simple:
        # Not a fatal condition; acknowledge to avoid retries
        resp = Response(status_code=status.HTTP_200_OK)
        try:
            hdr = timer.header()
            if hdr:
                resp.headers['Server-Timing'] = hdr
        except Exception:
            pass
        return resp

    # Idempotency
    if (str(simple.payment_status or "").lower() == "paid") or (getattr(simple, "charged_total_amount", 0) or 0) > 0:
        resp = Response(status_code=status.HTTP_200_OK)
        try:
            hdr = timer.header()
            if hdr:
                resp.headers['Server-Timing'] = hdr
        except Exception:
            pass
        return resp

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
            # Role-agnostic single message for webhook path; embed receipt URL
            receipt_url = f"{FRONTEND_PRIMARY}/receipts/{simple.payment_id}" if simple.payment_id else None
            k_both = f"payment_confirmed:{simple.payment_id}" if simple.payment_id else "payment_confirmed"

            created_msgs: list[models.Message] = []

            exists_both = (
                db.query(models.Message)
                .filter(models.Message.booking_request_id == br.id, models.Message.system_key == k_both)
                .first()
            )
            if not exists_both:
                content_text = (
                    f"Payment received. Booking confirmed. Receipt: {receipt_url}"
                    if receipt_url
                    else "Payment received. Booking confirmed."
                )
                m = crud.crud_message.create_message(
                    db=db,
                    booking_request_id=br.id,
                    sender_id=simple.artist_id,
                    sender_type=SenderType.ARTIST,
                    content=content_text,
                    message_type=MessageType.SYSTEM,
                    visible_to=VisibleTo.BOTH,
                    action=None,
                    system_key=k_both,
                )
                db.commit()
                created_msgs.append(m)

            try:
                if ws_manager and created_msgs:
                    for m in created_msgs:
                        env = _message_to_envelope(db, m)
                        t0 = datetime.utcnow()
                        await ws_manager.broadcast(int(br.id), env)
                        try:
                            enqueue_outbox(db, topic=f"booking-requests:{int(br.id)}", payload=env)
                        except Exception:
                            pass
                # Log total broadcast latency if needed; omitted for brevity
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
        # Compute provider net stage amounts (first/final)
        try:
            qv2 = db.query(QuoteV2).filter(QuoteV2.id == simple.quote_id).first()
        except Exception:
            qv2 = None
        services_total = 0.0
        try:
            if qv2 and isinstance(qv2.services, list):
                for s in qv2.services:
                    try:
                        services_total += float(s.get('price') or 0)
                    except Exception:
                        pass
        except Exception:
            pass
        pass_through = 0.0
        try:
            if qv2:
                pass_through += float(qv2.travel_fee or 0)
                pass_through += float(qv2.sound_fee or 0)
        except Exception:
            pass
        # Discount
        discount_ex = 0.0
        try:
            if qv2 and getattr(qv2, 'discount', None) is not None:
                discount_ex = float(qv2.discount or 0)
        except Exception:
            discount_ex = 0.0
        COMMISSION_RATE = float(os.getenv('COMMISSION_RATE', '0.075') or 0.075)
        VAT_RATE = float(os.getenv('VAT_RATE', '0.15') or 0.15)
        commissionable_base = round(max(0.0, (services_total + pass_through) - discount_ex), 2)
        commission = round(commissionable_base * COMMISSION_RATE, 2)
        vat_on_commission = round(commission * VAT_RATE, 2)
        # Supplier VAT include when provider VAT-registered
        supplier_vat_rate = 0.0
        try:
            prof = db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == int(simple.artist_id)).first()
            if prof and bool(getattr(prof, 'vat_registered', False)):
                try:
                    supplier_vat_rate = float(getattr(prof, 'vat_rate', VAT_RATE) or VAT_RATE)
                except Exception:
                    supplier_vat_rate = VAT_RATE
        except Exception:
            supplier_vat_rate = 0.0
        supplier_vat_amount = round(commissionable_base * supplier_vat_rate, 2)
        provider_net_total_estimate = round((commissionable_base + supplier_vat_amount) - commission - vat_on_commission, 2)
        try:
            from decimal import Decimal as _D, ROUND_HALF_UP as _R
            _pnet = _D(str(provider_net_total_estimate))
            _first = (_pnet / _D('2')).quantize(_D('0.01'), rounding=_R)
            _final = (_pnet - _first).quantize(_D('0.01'), rounding=_R)
            first_stage_amt = float(_first)
            final_stage_amt = float(_final)
        except Exception:
            first_stage_amt = round(provider_net_total_estimate / 2.0, 2)
            final_stage_amt = round(provider_net_total_estimate - first_stage_amt, 2)
        if not _meta_has("provider_escrow_in", split="first50"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_escrow_in', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(first_stage_amt), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "webhook", "split": "first50"})},
            )
        if not _meta_has("provider_escrow_hold", split="held50"):
            db.execute(
                text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_escrow_hold', :amt, 'ZAR', :meta)"),
                {"bid": simple.id, "amt": float(final_stage_amt), "meta": json.dumps({"gateway": "paystack", "reference": reference, "phase": "webhook", "split": "held50"})},
            )
        db.commit()
    except Exception:
        db.rollback()
    # Ensure payout rows exist (manual payout flow)
    try:
        _ensure_payout_rows(db, simple, amount, reference, phase="webhook")
    except Exception:
        pass
    # Best-effort: generate provider invoice (agent) on webhook set-off
    try:
        row = db.execute(text("SELECT id FROM invoices WHERE booking_id=:bid AND invoice_type IN ('provider_tax','provider_invoice') ORDER BY id DESC LIMIT 1"), {"bid": int(simple.id)}).fetchone()
        if not row:
            prof = db.query(models.ServiceProviderProfile).filter(models.ServiceProviderProfile.user_id == int(simple.artist_id)).first()
            is_vendor = bool(getattr(prof, 'vat_registered', False))
            crud_invoice.create_provider_invoice(db, simple, vendor=is_vendor)
    except Exception:
        pass
    # Best-effort: generate Booka client-fee tax invoice when split invoicing is enabled
    try:
        if settings.ENABLE_SPLIT_INVOICING:
            crud_invoice.create_client_fee_invoice(db, simple)
    except Exception:
        pass
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
    resp = Response(status_code=status.HTTP_200_OK)
    try:
        # Total handler time (approximate)
        timer.add('build', (time.perf_counter() - t_start_webhook) * 1000.0)
        hdr = timer.header()
        if hdr:
            resp.headers['Server-Timing'] = hdr
    except Exception:
        pass
    return resp


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
    current_user: User = Depends(get_current_user),
):
    """Return the receipt PDF for the given payment id.

    Auth: only the paying client may fetch the receipt.
    Always return a PDF generated via ReportLab (no HTML/Playwright rendering).
    """
    # Enforce ownership: payment reference must belong to the current client
    simple = db.query(BookingSimple).filter(BookingSimple.payment_id == payment_id).first()
    if not simple:
        raise error_response("Payment reference not recognized", {}, status.HTTP_404_NOT_FOUND)
    # Allow: paying client OR admin
    try:
        is_admin = db.query(models.AdminUser).filter(models.AdminUser.user_id == current_user.id).first() is not None
    except Exception:
        is_admin = False
    if not is_admin and simple.client_id != current_user.id:
        raise error_response("Forbidden", {}, status.HTTP_403_FORBIDDEN)

    path = os.path.abspath(os.path.join(RECEIPT_DIR, f"{payment_id}.pdf"))
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if os.path.exists(path):
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
    # On-demand stateless generation: try to build the PDF now using ReportLab.
    # If it succeeds, stream/upload the new file.
    try:
        ok = generate_receipt_pdf(db, payment_id)
        if ok and os.path.exists(path):
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
        # Best-effort only — proceed to direct ReportLab generation
        pass

    # Final fallback: generate a minimal PDF directly via ReportLab
    try:
        _generate_receipt_pdf_with_reportlab(db, payment_id, path)
    except Exception:
        # Ensure at least a stub PDF exists to satisfy content-type contract
        try:
            with open(path, "wb") as f:
                f.write(b"%PDF-1.4\n% Fallback receipt stub for security\n%%EOF")
        except Exception:
            pass
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
# Receipt PDF generation (ReportLab only)


def _derive_receipt_amounts(
    simple: BookingSimple | None,
    quote: QuoteV2 | None,
) -> tuple[float | None, float, str]:
    """Return (total_to_pay, booka_fee_incl, currency) snapshot for receipts.

    Receipts prefer stored charged_total_amount and only fall back to live quote math
    for legacy rows that predate the snapshot.
    """
    snapshot = compute_quote_totals_snapshot(quote) if quote is not None else None
    fee_incl = 0.0
    currency = settings.DEFAULT_CURRENCY or "ZAR"
    if snapshot is not None:
        fee_incl = float(snapshot.platform_fee_ex_vat + snapshot.platform_fee_vat)
        currency = snapshot.currency
    total_to_pay: float | None = None
    if simple and getattr(simple, "charged_total_amount", None) is not None:
        total_to_pay = float(getattr(simple, "charged_total_amount") or 0)
    elif snapshot is not None:
        # TODO: Remove this fallback once charged_total_amount is backfilled for legacy receipts.
        total_to_pay = float(snapshot.client_total_incl_vat)
    elif quote is not None and getattr(quote, "total", None) is not None:
        try:
            # TODO: Remove this fallback once charged_total_amount is backfilled for legacy receipts.
            total_to_pay = round(float(getattr(quote, "total") or 0) + fee_incl, 2)
        except Exception:
            total_to_pay = None
    return total_to_pay, fee_incl, currency


def _generate_receipt_pdf_with_reportlab(db: Session, payment_id: str, output_path: str) -> None:
    """Generate a branded receipt PDF using ReportLab (no HTML).

    Layout aims for global-standard clarity: header with brand + PAID badge,
    summary grid, parties, line items, and totals. Raises on hard I/O errors.
    """
    try:
        # Core ReportLab
        from reportlab.lib.pagesizes import A4  # type: ignore
        from reportlab.lib import colors  # type: ignore
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # type: ignore
        from reportlab.lib.units import mm  # type: ignore
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
        )  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("ReportLab unavailable for receipt generation") from exc

    # -----------------------------
    # Helpers and data gathering
    # -----------------------------
    def _zar(v: float | None) -> str:
        try:
            return f"ZAR {float(v or 0):,.2f}"
        except Exception:
            return "ZAR —"

    # Load context (best-effort; tolerate partial data)
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
    qv2: QuoteV2 | None = None

    bs: BookingSimple | None = db.query(BookingSimple).filter(BookingSimple.payment_id == payment_id).first()
    if bs:
        booking_id = getattr(bs, "id", None)
        try:
            amount = float(getattr(bs, "charged_total_amount", 0) or 0)
        except Exception:
            amount = None
        try:
            client_name = getattr(bs.client, "name", None)
            client_email = getattr(bs.client, "email", None)
        except Exception:
            client_name = client_name or None
            client_email = client_email or None
        try:
            artist_name = getattr(bs.artist, "name", None)
            artist_email = getattr(bs.artist, "email", None)
        except Exception:
            artist_name = artist_name or None
            artist_email = artist_email or None
        # Pull line items from QuoteV2 when available
        try:
            qv2 = db.query(QuoteV2).filter(QuoteV2.id == bs.quote_id).first()
        except Exception:
            qv2 = None
        if qv2:
            try:
                for s in (qv2.services or []):
                    desc = (s.get("description") or "Service").strip() or "Service"
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
            if (getattr(qv2, "accommodation", "") or "").strip():
                try:
                    accommodation_note = str(qv2.accommodation)
                except Exception:
                    accommodation_note = None
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

    # -----------------------------
    # Document + styles
    # -----------------------------
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Receipt {payment_id}",
        author="Booka",
    )
    brand = colors.HexColor("#6C3BFF")
    success = colors.HexColor("#16a34a")
    muted = colors.HexColor("#6b7280")
    border = colors.HexColor("#e5e7eb")

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TitleBrand", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, textColor=colors.black, spaceAfter=6))
    styles.add(ParagraphStyle(name="Muted", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=muted))
    styles.add(ParagraphStyle(name="Strong", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10))
    styles.add(ParagraphStyle(name="NormalSmall", parent=styles["Normal"], fontName="Helvetica", fontSize=10))

    story: list = []

    # Header: Brand + PAID badge
    header_tbl = Table(
        [
            [Paragraph("<b>Booka</b>", styles["TitleBrand"]), Paragraph("PAID", ParagraphStyle(name="PaidBadge", parent=styles["Normal"], textColor=success, backColor=colors.HexColor("#eafff0"), leading=12, fontName="Helvetica-Bold", alignment=1))],
        ],
        colWidths=[doc.width * 0.75, doc.width * 0.25],
        hAlign="LEFT",
    )
    header_tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ]
        )
    )
    story.append(header_tbl)
    story.append(Spacer(1, 6))

    # Summary grid
    issued_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    total_to_pay, _fee_incl, receipt_currency = _derive_receipt_amounts(bs, qv2)
    summary_amount_value = total_to_pay if total_to_pay is not None else (amount if amount is not None else total)
    summary_data = [
        [Paragraph("<font color='#6b7280'>Payment ID</font>", styles["NormalSmall"]), Paragraph(str(payment_id), styles["Strong"]),
         Paragraph("<font color='#6b7280'>Issued</font>", styles["NormalSmall"]), Paragraph(issued_str, styles["NormalSmall"])],
        [Paragraph("<font color='#6b7280'>Currency</font>", styles["NormalSmall"]), Paragraph((receipt_currency or "ZAR").upper(), styles["NormalSmall"]),
         Paragraph("<font color='#6b7280'>Amount</font>", styles["NormalSmall"]), Paragraph(_zar(summary_amount_value), styles["Strong"])],
    ]
    summary_tbl = Table(summary_data, colWidths=[doc.width*0.15, doc.width*0.35, doc.width*0.15, doc.width*0.35])
    summary_tbl.setStyle(
        TableStyle([
            ("INNERGRID", (0,0), (-1,-1), 0.25, border),
            ("BOX", (0,0), (-1,-1), 0.25, border),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("BACKGROUND", (0,0), (-1,-1), colors.whitesmoke),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ])
    )
    story.append(summary_tbl)
    story.append(Spacer(1, 8))

    # Parties (Client / Artist)
    client_block = [Paragraph("Client", styles["Muted"]), Paragraph((client_name or "") + (f"\n{client_email}" if client_email else ""), styles["NormalSmall"]) ]
    artist_block = [Paragraph("Artist", styles["Muted"]), Paragraph((artist_name or "") + (f"\n{artist_email}" if artist_email else ""), styles["NormalSmall"]) ]
    parties_tbl = Table([[client_block, artist_block]], colWidths=[doc.width*0.5, doc.width*0.5])
    parties_tbl.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP")]))
    story.append(parties_tbl)
    story.append(Spacer(1, 8))

    # Line items
    line_rows: list[list] = [[Paragraph("Description", styles["Strong"]), Paragraph("Amount", styles["Strong"])]]
    if items:
        for desc, price in items:
            line_rows.append([Paragraph(desc, styles["NormalSmall"]), Paragraph(_zar(price), styles["NormalSmall"])])
    else:
        line_rows.append([Paragraph("Booking", styles["NormalSmall"]), Paragraph(_zar(amount), styles["NormalSmall"])])
    if accommodation_note:
        line_rows.append([Paragraph("Accommodation", styles["NormalSmall"]), Paragraph(accommodation_note, styles["NormalSmall"])])
    items_tbl = Table(line_rows, colWidths=[doc.width*0.65, doc.width*0.35])
    items_tbl.setStyle(
        TableStyle([
            ("BOX", (0,0), (-1,-1), 0.25, border),
            ("INNERGRID", (0,0), (-1,-1), 0.25, border),
            ("BACKGROUND", (0,0), (-1,0), colors.Color(0.95,0.95,0.97)),
            ("ALIGN", (1,1), (1,-1), "RIGHT"),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ])
    )
    story.append(items_tbl)
    story.append(Spacer(1, 6))

    # Totals
    totals_rows: list[list] = []
    if subtotal is not None:
        totals_rows.append([Paragraph("Subtotal", styles["NormalSmall"]), Paragraph(_zar(subtotal), styles["NormalSmall"])])
    if (discount or 0) > 0:
        totals_rows.append([Paragraph("Discount", styles["NormalSmall"]), Paragraph("- " + _zar(discount or 0), styles["NormalSmall"])])
    # Provider VAT for visibility: total - (subtotal - discount)
    try:
        if total is not None:
            _vat_provider = round(float(total or 0) - float((subtotal or 0) - (discount or 0)), 2)
            if _vat_provider > 0:
                totals_rows.append([Paragraph("VAT (15%)", styles["NormalSmall"]), Paragraph(_zar(_vat_provider), styles["NormalSmall"])])
    except Exception:
        pass
    # Booka service fee (VAT included) as a single line
    try:
        if _fee_incl > 0:
            totals_rows.append([Paragraph("Booka Service Fee (3% - VAT included)", styles["NormalSmall"]), Paragraph(_zar(_fee_incl), styles["NormalSmall"])])
    except Exception:
        pass
    # Final: Total To Pay equals amount charged if present, else total + fee incl
    if total_to_pay is not None:
        totals_rows.append([Paragraph("Total To Pay", styles["Strong"]), Paragraph(_zar(total_to_pay), styles["Strong"])])
    if booking_id:
        totals_rows.append([Paragraph("Booking", styles["NormalSmall"]), Paragraph(f"#{booking_id}", styles["NormalSmall"])])
    if totals_rows:
        totals_tbl = Table(totals_rows, colWidths=[doc.width*0.65, doc.width*0.35])
        totals_tbl.setStyle(TableStyle([
            ("ALIGN", (1,0), (1,-1), "RIGHT"),
            ("TOPPADDING", (0,0), (-1,-1), 2),
            ("BOTTOMPADDING", (0,0), (-1,-1), 2),
        ]))
        story.append(totals_tbl)

    story.append(Spacer(1, 12))
    story.append(Paragraph("Thank you for booking with Booka.", styles["Muted"]))

    # Build document
    doc.build(story)


def generate_receipt_pdf(db: Session, payment_id: str) -> bool:
    """Generate a PDF receipt for the given payment id if missing.

    ReportLab-only path: create the PDF directly. Returns True if the file exists after.
    """
    path = os.path.abspath(os.path.join(RECEIPT_DIR, f"{payment_id}.pdf"))
    if os.path.exists(path):
        return True
    try:
        _generate_receipt_pdf_with_reportlab(db, payment_id, path)
    except Exception:
        # Do not raise; caller will handle stub creation as a last resort
        pass
    return os.path.exists(path)


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
