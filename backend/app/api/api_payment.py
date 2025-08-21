from fastapi import APIRouter, Depends, status, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import logging
import os
from decimal import Decimal
from datetime import datetime, timedelta
import httpx
import uuid

from .. import crud
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

logger = logging.getLogger(__name__)

PAYMENT_GATEWAY_FAKE = os.getenv("PAYMENT_GATEWAY_FAKE")

router = APIRouter(tags=["payments"])


class PaymentCreate(BaseModel):
    booking_request_id: int
    amount: Optional[float] = Field(default=None, gt=0)
    full: Optional[bool] = False


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_payment(
    payment_in: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_client),
):
    logger.info(
        "Process payment for request %s amount %s full=%s",
        payment_in.booking_request_id,
        payment_in.amount,
        payment_in.full,
    )

    booking = (
        db.query(BookingSimple)
        .join(QuoteV2, BookingSimple.quote_id == QuoteV2.id)
        .filter(QuoteV2.booking_request_id == payment_in.booking_request_id)
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

    if booking.deposit_paid:
        logger.warning("Duplicate payment attempt for booking %s", booking.id)
        raise error_response(
            "Deposit already paid",
            {"payment": "duplicate"},
            status.HTTP_400_BAD_REQUEST,
        )

    amount = (
        payment_in.amount
        if payment_in.amount is not None
        else float(booking.deposit_amount or 0)
    )
    logger.info("Resolved payment amount %s", amount)
    charge_amount = Decimal(str(amount))

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

    if not payment_in.full:
        booking.deposit_amount = charge_amount

    booking.deposit_paid = True
    booking.payment_status = "paid" if payment_in.full else "deposit_paid"
    booking.payment_id = charge.get("id")
    if payment_in.full:
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
            crud.crud_message.create_message(
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

    return {"status": "ok", "payment_id": charge.get("id")}


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
                amount = float(bs.charged_total_amount or bs.deposit_amount or 0)
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
