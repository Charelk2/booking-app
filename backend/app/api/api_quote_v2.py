from fastapi import APIRouter, Depends, status, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging
import os

from .. import models, schemas
from ..utils import error_response
from ..utils.notifications import notify_user_new_message
from ..crud import crud_quote_v2
from ..utils.outbox import enqueue_outbox
from .. import crud
from .dependencies import get_db, get_current_user
from .api_ws import manager
from ..schemas import message as message_schemas
import asyncio

router = APIRouter(tags=["QuotesV2"])
logger = logging.getLogger(__name__)

QUOTE_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "quotes")
os.makedirs(QUOTE_DIR, exist_ok=True)


@router.post(
    "/quotes", response_model=schemas.QuoteV2Read, status_code=status.HTTP_201_CREATED
)
def create_quote(quote_in: schemas.QuoteV2Create, db: Session = Depends(get_db)):
    try:
        quote = crud_quote_v2.create_quote(db, quote_in)
        logger.info(
            "Created quote %s for booking request %s",
            quote.id,
            quote.booking_request_id,
        )
        msg_quote = crud.crud_message.create_message(
            db=db,
            booking_request_id=quote.booking_request_id,
            sender_id=quote.artist_id,
            sender_type=models.SenderType.ARTIST,
            content="Artist sent a quote",
            message_type=models.MessageType.QUOTE,
            quote_id=quote.id,
            attachment_url=None,
        )
        # Provide additional context and notify the client that the quote is
        # ready to review. The system message keeps both parties in sync.
        try:
            formatted_total = f"R {float(quote.total):,.2f}"
        except Exception:
            formatted_total = str(quote.total)
        detail_content = f"Quote sent with total {formatted_total}"
        msg_sys = crud.crud_message.create_message(
            db=db,
            booking_request_id=quote.booking_request_id,
            sender_id=quote.artist_id,
            sender_type=models.SenderType.ARTIST,
            content=detail_content,
            message_type=models.MessageType.SYSTEM,
            attachment_url=None,
        )
        # Broadcast both the QUOTE message and the SYSTEM line to the thread so
        # active MessageThread views update immediately without a manual refresh.
        try:
            def _payload(m: any) -> dict:
                try:
                    return message_schemas.MessageResponse.model_validate(m).model_dump()
                except Exception:
                    # Minimal fallback
                    return {
                        "id": int(getattr(m, "id", 0) or 0),
                        "booking_request_id": int(getattr(m, "booking_request_id", quote.booking_request_id)),
                        "sender_id": int(getattr(m, "sender_id", quote.artist_id)),
                        "sender_type": str(getattr(m, "sender_type", models.SenderType.ARTIST)),
                        "message_type": str(getattr(m, "message_type", models.MessageType.USER)),
                        "content": str(getattr(m, "content", "") or ""),
                        "quote_id": int(getattr(m, "quote_id", 0) or 0) or None,
                        "timestamp": getattr(m, "timestamp", None) or getattr(m, "created_at", None) or None,
                    }

            br_id = int(quote.booking_request_id)
            for m in (msg_quote, msg_sys):
                payload = _payload(m)
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(manager.broadcast(br_id, payload))
                except RuntimeError:
                    try:
                        asyncio.run(manager.broadcast(br_id, payload))
                    except Exception:
                        pass
        except Exception:
            # Best-effort only; thread will still pick up changes on next poll
            pass
        booking_request = (
            db.query(models.BookingRequest)
            .filter(models.BookingRequest.id == quote.booking_request_id)
            .first()
        )
        if booking_request:
            client = (
                db.query(models.User)
                .filter(models.User.id == booking_request.client_id)
                .first()
            )
            artist = (
                db.query(models.User)
                .filter(models.User.id == booking_request.artist_id)
                .first()
            )
            if client and artist:
                notify_user_new_message(
                    db,
                    client,
                    artist,
                    quote.booking_request_id,
                    "Artist sent a quote",
                    models.MessageType.QUOTE,
                )
        # Compute client preview fields (to avoid UI drift)
        try:
            PS = float(getattr(quote, "subtotal", 0) or 0)
            total = float(getattr(quote, "total", 0) or 0)
            COMMISSION_RATE = float(os.getenv('COMMISSION_RATE', '0.075') or 0.075)
            CLIENT_FEE_RATE = float(os.getenv('CLIENT_FEE_RATE', '0.03') or 0.03)
            VAT_RATE = float(os.getenv('VAT_RATE', '0.15') or 0.15)
            fee = round(PS * CLIENT_FEE_RATE, 2)
            fee_vat = round(fee * VAT_RATE, 2)
            client_total = round(total + fee + fee_vat, 2)
            payload = schemas.QuoteV2Read.model_validate(quote).model_dump()
            payload.update({
                "provider_subtotal_preview": PS,
                "booka_fee_preview": fee,
                "booka_fee_vat_preview": fee_vat,
                "client_total_preview": client_total,
                "rates_preview": {"commission_rate": COMMISSION_RATE, "client_fee_rate": CLIENT_FEE_RATE, "vat_rate": VAT_RATE},
            })
            return payload
        except Exception:
            return quote
    except HTTPException:
        raise
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
    # Defensive: coalesce timestamps for legacy rows
    try:
        from datetime import datetime as _dt
        if not getattr(quote, "created_at", None):
            quote.created_at = getattr(quote, "updated_at", None) or _dt.utcnow()
        if not getattr(quote, "updated_at", None):
            quote.updated_at = quote.created_at
        db.add(quote)
        db.commit()
        db.refresh(quote)
    except Exception:
        pass
    # Attach preview fields for client totals
    try:
        PS = float(getattr(quote, "subtotal", 0) or 0)
        total = float(getattr(quote, "total", 0) or 0)
        COMMISSION_RATE = float(os.getenv('COMMISSION_RATE', '0.075') or 0.075)
        CLIENT_FEE_RATE = float(os.getenv('CLIENT_FEE_RATE', '0.03') or 0.03)
        VAT_RATE = float(os.getenv('VAT_RATE', '0.15') or 0.15)
        fee = round(PS * CLIENT_FEE_RATE, 2)
        fee_vat = round(fee * VAT_RATE, 2)
        client_total = round(total + fee + fee_vat, 2)
        payload = schemas.QuoteV2Read.model_validate(quote).model_dump()
        payload.update({
            "provider_subtotal_preview": PS,
            "booka_fee_preview": fee,
            "booka_fee_vat_preview": fee_vat,
            "client_total_preview": client_total,
            "rates_preview": {"commission_rate": COMMISSION_RATE, "client_fee_rate": CLIENT_FEE_RATE, "vat_rate": VAT_RATE},
        })
        return payload
    except Exception:
        return quote


@router.post("/quotes/{quote_id}/accept", response_model=schemas.BookingSimpleRead)
def accept_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    service_id: int | None = None,
):
    try:
        booking = crud_quote_v2.accept_quote(db, quote_id, service_id=service_id)
        # Defensive: coalesce timestamps for response
        try:
            from datetime import datetime as _dt
            if not getattr(booking, "created_at", None):
                booking.created_at = getattr(booking, "updated_at", None) or _dt.utcnow()
            if not getattr(booking, "updated_at", None):
                booking.updated_at = booking.created_at
            db.add(booking)
            db.commit()
            db.refresh(booking)
        except Exception:
            pass
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


@router.post("/quotes/{quote_id}/decline", response_model=schemas.QuoteV2Read)
def decline_quote(quote_id: int, db: Session = Depends(get_db)):
    try:
        quote = crud_quote_v2.decline_quote(db, quote_id)
        # Defensive: coalesce timestamps for legacy rows
        try:
            from datetime import datetime as _dt
            if not getattr(quote, "created_at", None):
                quote.created_at = getattr(quote, "updated_at", None) or _dt.utcnow()
            if not getattr(quote, "updated_at", None):
                quote.updated_at = quote.created_at
            db.add(quote)
            db.commit()
            db.refresh(quote)
        except Exception:
            pass
        logger.info("Quote %s declined", quote_id)
        # Reliable realtime: enqueue outbox with the newly created system message
        try:
            br_id = int(getattr(quote, "booking_request_id", 0) or 0)
            if br_id:
                # Fetch the most recent "Quote declined." system message for this thread
                from .. import models
                last = (
                    db.query(models.Message)
                    .filter(
                        models.Message.booking_request_id == br_id,
                        models.Message.message_type == models.MessageType.SYSTEM,
                        models.Message.content == "Quote declined.",
                    )
                    .order_by(models.Message.id.desc())
                    .first()
                )
                if last:
                    payload = message_schemas.MessageResponse.model_validate(last).model_dump()
                    enqueue_outbox(db, topic=f"booking-requests:{br_id}", payload=payload)
        except Exception:
            # best-effort only; thread will still update on next fetch
            pass
        return quote
    except ValueError as exc:
        quote = crud_quote_v2.get_quote(db, quote_id)
        logger.warning(
            "Declining quote failed; quote_id=%s artist_id=%s client_id=%s error=%s",
            quote_id,
            getattr(quote, "artist_id", None),
            getattr(quote, "client_id", None),
            exc,
        )
        raise error_response(
            str(exc), {"quote_id": "invalid"}, status.HTTP_400_BAD_REQUEST
        )
    except SQLAlchemyError as exc:  # pragma: no cover - generic failure path
        quote = crud_quote_v2.get_quote(db, quote_id)
        logger.exception(
            "Database error declining quote %s; artist_id=%s client_id=%s",
            quote_id,
            getattr(quote, "artist_id", None),
            getattr(quote, "client_id", None),
        )
        raise error_response(
            "Internal Server Error",
            {"quote_id": "db_error"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/quotes/{quote_id}/pdf")
def get_quote_pdf(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quote = crud_quote_v2.get_quote(db, quote_id)
    if not quote or (
        quote.client_id != current_user.id and quote.artist_id != current_user.id
    ):
        raise error_response(
            "Quote not found",
            {"quote_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    # Lazy import to avoid heavy deps during OpenAPI generation
    from ..services import quote_pdf  # type: ignore
    pdf_bytes = quote_pdf.generate_pdf(quote)
    filename = f"quote_{quote.id}.pdf"
    path = os.path.join(QUOTE_DIR, filename)
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return FileResponse(path, media_type="application/pdf", filename=filename)
