from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import logging

from ..models import User
from .dependencies import get_db, get_current_active_client

logger = logging.getLogger(__name__)

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
    # Placeholder: real integration would call a payment gateway
    logger.info(
        "Process payment for request %s amount %s full=%s",
        payment_in.booking_request_id,
        payment_in.amount,
        payment_in.full,
    )
    return {"status": "ok"}
