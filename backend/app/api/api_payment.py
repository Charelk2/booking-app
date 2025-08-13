from fastapi import APIRouter, Depends, status
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

    if PAYMENT_GATEWAY_FAKE:
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
def get_payment_receipt(payment_id: str):
    """Return the receipt PDF for the given payment id."""
    path = os.path.abspath(os.path.join(RECEIPT_DIR, f"{payment_id}.pdf"))
    if not os.path.exists(path):
        logger.warning("Receipt %s not found", payment_id)
        raise error_response(
            "Receipt not found",
            {"payment_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{payment_id}.pdf",
    )
