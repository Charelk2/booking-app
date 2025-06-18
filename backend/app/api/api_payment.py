from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import logging
import os
from decimal import Decimal
import httpx

from ..models import User, BookingSimple, QuoteV2
from .dependencies import get_db, get_current_active_client

logger = logging.getLogger(__name__)

PAYMENT_GATEWAY_URL = os.getenv("PAYMENT_GATEWAY_URL", "https://example.com")

router = APIRouter(tags=["payments"])


class PaymentCreate(BaseModel):
    booking_request_id: int
    amount: float = Field(gt=0)
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

    try:
        response = httpx.post(
            f"{PAYMENT_GATEWAY_URL}/charges",
            json={"amount": payment_in.amount, "currency": "ZAR"},
            timeout=10,
        )
        response.raise_for_status()
        charge = response.json()
    except Exception as exc:  # pragma: no cover - network failure path
        logger.error("Payment gateway error: %s", exc, exc_info=True)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail="Payment gateway error"
        )

    booking.deposit_amount = Decimal(str(payment_in.amount))
    booking.deposit_paid = True
    booking.payment_status = "paid" if payment_in.full else "deposit_paid"
    booking.payment_id = charge.get("id")
    db.commit()
    db.refresh(booking)

    return {"status": "ok", "payment_id": charge.get("id")}
