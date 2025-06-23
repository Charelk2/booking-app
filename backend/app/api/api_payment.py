from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import logging
import os
from decimal import Decimal
import httpx
import uuid

from ..models import User, BookingSimple, QuoteV2
from .dependencies import get_db, get_current_active_client
from ..core.config import settings

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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")

    if booking.client_id != current_user.id:
        logger.warning(
            "User %s attempted payment for booking %s",
            current_user.id,
            booking.id,
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    if booking.deposit_paid:
        logger.warning(
            "Duplicate payment attempt for booking %s", booking.id
        )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Deposit already paid"
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
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, detail="Payment gateway error"
            )

    if not payment_in.full:
        booking.deposit_amount = charge_amount
    booking.deposit_paid = True
    booking.payment_status = "paid" if payment_in.full else "deposit_paid"
    booking.payment_id = charge.get("id")
    db.commit()
    db.refresh(booking)

    return {"status": "ok", "payment_id": charge.get("id")}


RECEIPT_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "receipts")


@router.get("/{payment_id}/receipt")
def get_payment_receipt(payment_id: str):
    """Return the receipt PDF for the given payment id."""
    path = os.path.abspath(os.path.join(RECEIPT_DIR, f"{payment_id}.pdf"))
    if not os.path.exists(path):
        logger.warning("Receipt %s not found", payment_id)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt not found")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{payment_id}.pdf",
    )
