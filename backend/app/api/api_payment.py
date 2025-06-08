from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from ..models import User
from .dependencies import get_db, get_current_active_client

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
    print(
        f"Process payment for request {payment_in.booking_request_id} amount {payment_in.amount} full={payment_in.full}"
    )
    return {"status": "ok"}
