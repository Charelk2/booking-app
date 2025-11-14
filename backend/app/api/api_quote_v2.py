from fastapi import APIRouter, Depends, status, HTTPException, Header, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import SQLAlchemyError
import logging
import os
import time
from datetime import datetime
import hashlib

from .. import models, schemas
from ..utils import error_response
from ..utils.notifications import notify_user_new_message
from ..crud import crud_quote_v2
from ..utils.outbox import enqueue_outbox
from .. import crud
from .dependencies import get_db, get_current_user
from .api_ws import manager
from ..schemas import message as message_schemas
from ..services.quote_totals import quote_preview_fields, compute_quote_totals_snapshot, quote_totals_preview_payload
from ..utils.json import dumps_bytes as _json_dumps
import asyncio

router = APIRouter(tags=["QuotesV2"])
logger = logging.getLogger(__name__)

QUOTE_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "quotes")
os.makedirs(QUOTE_DIR, exist_ok=True)

# Use shared JSON serializer (handles Decimals, datetimes, and non-str keys)


def _quote_payload_with_preview(quote: models.QuoteV2) -> dict:
    payload = schemas.QuoteV2Read.model_validate(quote).model_dump()
    payload.update(quote_preview_fields(quote))
    return payload


# Lightweight totals preview for client-side “Review” (no quote persisted).
from pydantic import BaseModel
from decimal import Decimal
from ..schemas.quote_v2 import QuoteTotalsPreview as _QuoteTotalsPreview


class TotalsPreviewIn(BaseModel):
    subtotal: Decimal | float | None = None
    total: Decimal | float | None = None
    currency: str | None = None


@router.post("/quotes/preview", response_model=_QuoteTotalsPreview)
def preview_totals(payload: TotalsPreviewIn):
    """Return platform fee preview and client total from provided amounts.

    Inputs:
      - subtotal: provider subtotal (EX provider VAT)
      - total: provider total (INCL provider VAT)
      - currency: optional currency label (defaults via settings)
    """
    src = {
        "subtotal": payload.subtotal,
        "total": payload.total,
        "currency": payload.currency,
    }
    snap = compute_quote_totals_snapshot(src)
    if not snap:
        return _QuoteTotalsPreview(
            provider_subtotal=None,
            platform_fee_ex_vat=None,
            platform_fee_vat=None,
            client_total_incl_vat=None,
        )
    pv = quote_totals_preview_payload(snap)
    return _QuoteTotalsPreview(
        provider_subtotal=pv.get("provider_subtotal"),
        platform_fee_ex_vat=pv.get("platform_fee_ex_vat"),
        platform_fee_vat=pv.get("platform_fee_vat"),
        client_total_incl_vat=pv.get("client_total_incl_vat"),
    )


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
        # ready to review. Keep the system line neutral (no amounts) so there
        # is no mismatch between what the artist sees as their total and what
        # the client pays after Booka fees are applied; detailed totals live in
        # the quote bubble and booking summary instead.
        detail_content = "Quote sent."

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
        try:
            return _quote_payload_with_preview(quote)
        except Exception:
            return schemas.QuoteV2Read.model_validate(quote).model_dump()
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


@router.get("/quotes/{quote_id}", response_model=None)
def read_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    if_none_match: str | None = Header(default=None, convert_underscores=False, alias="If-None-Match"),
):
    logger.info("Fetching quote %s", quote_id)
    t_start = time.perf_counter()
    # Early ETag pre-check using updated_at marker
    try:
        upd = (
            db.query(models.QuoteV2.updated_at)
            .filter(models.QuoteV2.id == quote_id)
            .scalar()
        )
        marker = upd.isoformat(timespec="seconds") if isinstance(upd, datetime) else "0"
        etag_pre = f'W/"q:{int(quote_id)}:{hashlib.sha1(marker.encode()).hexdigest()}"'
        if if_none_match and if_none_match.strip() == etag_pre:
            pre_ms = (time.perf_counter() - t_start) * 1000.0
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag_pre, "Server-Timing": f"pre;dur={pre_ms:.1f}"})
    except Exception:
        etag_pre = None

    t_comp_start = time.perf_counter()
    # Compose quote + minimal booking/service context in one roundtrip
    quote = (
        db.query(models.QuoteV2)
        .options(
            selectinload(models.QuoteV2.booking_request)
            .selectinload(models.BookingRequest.service)
            .load_only(models.Service.id, models.Service.service_type, models.Service.price, models.Service.details),
        )
        .filter(models.QuoteV2.id == quote_id)
        .first()
    )
    if not quote:
        logger.warning("Quote %s not found", quote_id)
        raise error_response(
            f"Quote {quote_id} not found",
            {"quote_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    # Defensive: coalesce timestamps for legacy rows
    try:
        if not getattr(quote, "created_at", None):
            quote.created_at = getattr(quote, "updated_at", None) or datetime.utcnow()
        if not getattr(quote, "updated_at", None):
            quote.updated_at = quote.created_at
    except Exception:
        pass
    # Attach booking_id (if exists)
    try:
        bid = (
            db.query(models.Booking.id)
            .filter(models.Booking.quote_id == quote_id)
            .scalar()
        )
        setattr(quote, "booking_id", int(bid) if bid else None)
    except Exception:
        pass
    try:
        payload = _quote_payload_with_preview(quote)
    except Exception:
        payload = schemas.QuoteV2Read.model_validate(quote).model_dump()
    # Serialize with orjson and attach timing
    body = _json_dumps(payload)
    comp_ms = (time.perf_counter() - t_comp_start) * 1000.0
    ser_ms = 0.0
    try:
        t_ser = time.perf_counter()
        body = _json_dumps(payload)
        ser_ms = (time.perf_counter() - t_ser) * 1000.0
    except Exception:
        pass
    # ETag based on updated_at marker
    try:
        marker = quote.updated_at.isoformat(timespec="seconds") if quote.updated_at else "0"
        etag = f'W/"q:{int(quote.id)}:{hashlib.sha1(marker.encode()).hexdigest()}"'
    except Exception:
        etag = etag_pre
    headers = {"Cache-Control": "no-cache", "Server-Timing": f"compose;dur={comp_ms:.1f}, ser;dur={ser_ms:.1f}"}
    if etag:
        headers["ETag"] = etag
    return Response(content=body, media_type="application/json", headers=headers)


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
        try:
            return _quote_payload_with_preview(quote)
        except Exception:
            return schemas.QuoteV2Read.model_validate(quote).model_dump()
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


@router.get("/quotes/prefill", response_model=None)
def get_quote_prefill(
    booking_request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return minimal prefill data for an inline quote form.

    Includes service price/type and travel breakdown/cost so providers can seed
    the quote form instantly without multiple round-trips.
    """
    br = (
        db.query(models.BookingRequest)
        .options(
            selectinload(models.BookingRequest.service).load_only(
                models.Service.id,
                models.Service.service_type,
                models.Service.price,
                models.Service.details,
            )
        )
        .filter(models.BookingRequest.id == booking_request_id)
        .first()
    )
    if not br or (br.client_id != current_user.id and br.artist_id != current_user.id):
        raise error_response(
            "Booking request not found",
            {"booking_request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    svc = br.service
    payload = {
        "booking_request_id": int(br.id),
        "service_id": int(getattr(svc, "id", 0) or 0) or None,
        "service_type": getattr(svc, "service_type", None).value if getattr(svc, "service_type", None) else None,
        "service_price": float(getattr(svc, "price", 0) or 0),
        "travel_breakdown": getattr(br, "travel_breakdown", None) or None,
        "travel_cost": float(getattr(br, "travel_cost", 0) or 0),
    }
    return Response(content=_json_dumps(payload), media_type="application/json", headers={"Cache-Control": "no-cache"})
