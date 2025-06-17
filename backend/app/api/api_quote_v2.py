from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging

from .. import models, schemas
from ..utils import error_response
from ..crud import crud_quote_v2, crud_message
from .dependencies import get_db

router = APIRouter(tags=["QuotesV2"])
logger = logging.getLogger(__name__)


@router.post(
    "/quotes", response_model=schemas.QuoteV2Read, status_code=status.HTTP_201_CREATED
)
def create_quote(quote_in: schemas.QuoteV2Create, db: Session = Depends(get_db)):
    try:
        quote = crud_quote_v2.create_quote(db, quote_in)
        logger.info(
            "Created quote %s for booking request %s",
            quote.id,
            quote_in.booking_request_id,
        )
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
        logger.error(
            "Failed to create quote; artist_id=%s client_id=%s request_id=%s error=%s",
            quote_in.artist_id,
            quote_in.client_id,
            quote_in.booking_request_id,
            exc,
            exc_info=True,
        )
        raise error_response(
            "Unable to create quote",
            {"quote": "create_failed"},
            status.HTTP_400_BAD_REQUEST,
        )


@router.get("/quotes/{quote_id}", response_model=schemas.QuoteV2Read)
def read_quote(quote_id: int, db: Session = Depends(get_db)):
    logger.info("Fetching quote %s", quote_id)
    quote = crud_quote_v2.get_quote(db, quote_id)
    if not quote:
        logger.warning("Quote %s not found", quote_id)
        raise error_response(
            f"Quote {quote_id} not found",
            {"quote_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    return quote


@router.post("/quotes/{quote_id}/accept", response_model=schemas.BookingSimpleRead)
def accept_quote(quote_id: int, db: Session = Depends(get_db)):
    try:
        booking = crud_quote_v2.accept_quote(db, quote_id)
        logger.info("Quote %s accepted creating booking %s", quote_id, booking.id)
        return booking
    except ValueError as exc:
        quote = crud_quote_v2.get_quote(db, quote_id)
        logger.warning(
            "Accepting quote failed; quote_id=%s artist_id=%s client_id=%s error=%s",
            quote_id,
            getattr(quote, "artist_id", None),
            getattr(quote, "client_id", None),
            exc,
        )
        raise error_response(
            str(exc), {"quote_id": "invalid"}, status.HTTP_400_BAD_REQUEST
        )
    except SQLAlchemyError as exc:
        quote = crud_quote_v2.get_quote(db, quote_id)
        logger.exception(
            "Database error accepting quote %s; artist_id=%s client_id=%s",
            quote_id,
            getattr(quote, "artist_id", None),
            getattr(quote, "client_id", None),
        )
        raise error_response(
            "Internal Server Error",
            {"quote_id": "db_error"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
