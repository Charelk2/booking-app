from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..crud import crud_quote_v2, crud_message
from .dependencies import get_db

router = APIRouter(tags=["QuotesV2"])


@router.post("/quotes", response_model=schemas.QuoteV2Read, status_code=status.HTTP_201_CREATED)
def create_quote(quote_in: schemas.QuoteV2Create, db: Session = Depends(get_db)):
    try:
        quote = crud_quote_v2.create_quote(db, quote_in)
        crud_message.create_message(
            db=db,
            booking_request_id=quote_in.booking_request_id,
            sender_id=quote_in.artist_id,
            sender_type=models.SenderType.ARTIST,
            content="Artist sent a quote",
            message_type=models.MessageType.QUOTE,
            quote_id=quote.id,
            attachment_url=None,
        )
        return quote
    except Exception as exc:  # pragma: no cover - generic failure path
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


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

