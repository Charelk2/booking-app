from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..crud import crud_quote_v2
from .dependencies import get_db

router = APIRouter(tags=["QuotesV2"])


@router.post("/quotes", response_model=schemas.QuoteV2Read, status_code=status.HTTP_201_CREATED)
def create_quote(quote_in: schemas.QuoteV2Create, db: Session = Depends(get_db)):
    try:
        quote = crud_quote_v2.create_quote(db, quote_in)
        return quote
    except Exception as exc:  # pragma: no cover - generic failure path
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/quotes/{quote_id}", response_model=schemas.QuoteV2Read)
def read_quote(quote_id: int, db: Session = Depends(get_db)):
    quote = crud_quote_v2.get_quote(db, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    return quote


@router.post("/quotes/{quote_id}/accept", response_model=schemas.BookingSimpleRead)
def accept_quote(quote_id: int, db: Session = Depends(get_db)):
    try:
        booking = crud_quote_v2.accept_quote(db, quote_id)
        return booking
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

