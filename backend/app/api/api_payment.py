from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import logging
import os
from decimal import Decimal
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
from .dependencies import get_db, get_current_active_client
from ..core.config import settings
from ..utils import error_response
from .api_sound_outreach import kickoff_sound_outreach

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
        # Auto-kickoff sound outreach if the booking requires sound
        try:
            tb = br.travel_breakdown or {}
            if bool(tb.get("sound_required")):
                event_city = tb.get("event_city") or ""
                selected_sid = tb.get("selected_sound_service_id")
                if isinstance(selected_sid, str):
                    try:
                        selected_sid = int(selected_sid)
                    except Exception:
                        selected_sid = None
                if event_city:
                    kickoff_sound_outreach(
                        booking.id,
                        event_city=event_city,
                        request_timeout_hours=24,
                        mode="sequential",
                        selected_service_id=selected_sid,
                        db=db,
                        current_artist=db.query(User).filter(User.id == booking.artist_id).first(),
                    )
        except Exception as exc:  # pragma: no cover
            logger.warning(
                "Auto outreach failed after payment for booking %s: %s", booking.id, exc
            )

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
