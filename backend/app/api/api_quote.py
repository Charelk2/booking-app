from fastapi import APIRouter, Depends, status, HTTPException, Header, Response, Query, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import SQLAlchemyError
import logging
import os
import time
from datetime import datetime
import hashlib
import json
from typing import List

from .. import models, schemas
from ..utils import error_response
from ..utils.notifications import notify_user_new_message, notify_client_new_quote_email
from ..crud import crud_quote
from ..utils.outbox import enqueue_outbox
from .. import crud
from .dependencies import get_db, get_current_user, get_current_service_provider
from .api_ws import manager
from ..schemas import message as message_schemas
from ..services.quote_totals import quote_preview_fields, compute_quote_totals_snapshot, quote_totals_preview_payload
from ..services.booking_quote import calculate_quote_breakdown
from ..utils.json import dumps_bytes as _json_dumps
import asyncio
from ..schemas.sound_estimate import SoundEstimateOut, SoundEstimateWithService
from app.service_types.sound_service import estimate_sound_service

router = APIRouter(tags=["Quotes"])
logger = logging.getLogger(__name__)

QUOTE_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "quotes")
os.makedirs(QUOTE_DIR, exist_ok=True)

# Use shared JSON serializer (handles Decimals, datetimes, and non-str keys)


def _quote_payload_with_preview(quote: models.QuoteV2) -> dict:
    payload = schemas.QuoteV2Read.model_validate(quote).model_dump()
    payload.update(quote_preview_fields(quote))
    return payload


def _quote_etag(quote_id: int, marker: str | None) -> str:
    """Return a weak ETag for a quote based on an updated_at marker."""
    marker = marker or "0"
    digest = hashlib.sha1(marker.encode()).hexdigest()
    return f'W/"q:{int(quote_id)}:{digest}"'


# Lightweight totals preview for client-side “Review” (no quote persisted).
from pydantic import BaseModel
from decimal import Decimal
from ..schemas.quote_v2 import QuoteTotalsPreview as _QuoteTotalsPreview
from ..schemas import request_quote as quote_calc_schemas


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
    "/quotes/estimate",
    response_model=quote_calc_schemas.QuoteCalculationResponse,
    response_model_exclude_none=True,
)
def estimate_quote(
    body: quote_calc_schemas.QuoteCalculationParams,
    db: Session = Depends(get_db),
):
    """Stateless Live Performance estimate (formerly /quotes/calculate).

    This endpoint delegates to the live-performance engine under
    :mod:`app.service_types.live_performance` via the
    :func:`calculate_quote_breakdown` facade in ``services.booking_quote``.
    """
    svc = crud.service.get_service(db, body.service_id)
    if not svc:
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    accommodation = (
        Decimal(str(body.accommodation_cost)) if body.accommodation_cost is not None else None
    )
    breakdown = calculate_quote_breakdown(
        base_fee=Decimal(str(body.base_fee)),
        distance_km=body.distance_km,
        accommodation_cost=accommodation,
        travel_breakdown=getattr(body, "travel_breakdown", None),
        service=svc,
        event_city=body.event_city,
        db=db,
        guest_count=getattr(body, "guest_count", None),
        venue_type=getattr(body, "venue_type", None),
        stage_required=getattr(body, "stage_required", None),
        stage_size=getattr(body, "stage_size", None),
        lighting_evening=getattr(body, "lighting_evening", None),
        upgrade_lighting_advanced=getattr(body, "upgrade_lighting_advanced", None),
        backline_required=getattr(body, "backline_required", None),
        selected_sound_service_id=getattr(body, "selected_sound_service_id", None),
        supplier_distance_km=getattr(body, "supplier_distance_km", None),
        rider_units=(body.rider_units.dict() if getattr(body, "rider_units", None) else None),
        backline_requested=getattr(body, "backline_requested", None),
    )
    return breakdown


@router.post(
    "/quotes/estimate/sound",
    response_model=SoundEstimateOut,
    response_model_exclude_none=True,
)
def estimate_sound_quote(
    body: SoundEstimateWithService,
    db: Session = Depends(get_db),
):
    """Stateless sound-provider estimate (audience packages + add-ons).

    This endpoint calls the shared sound-service engine under
    :mod:`app.service_types.sound_service` so sound pricing stays consistent
    across the wizard, inline quotes, and booking agents.
    """
    svc = crud.service.get_service(db, body.service_id)
    if not svc:
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    payload = estimate_sound_service(
        svc.details or {},
        guest_count=int(body.guest_count or 0),
        venue_type=body.venue_type,
        stage_required=bool(body.stage_required),
        stage_size=body.stage_size,
        lighting_evening=bool(body.lighting_evening),
        upgrade_lighting_advanced=bool(body.upgrade_lighting_advanced),
        rider_units=body.rider_units.dict() if body.rider_units else None,
        backline_requested=body.backline_requested,
    )
    return SoundEstimateOut(**payload)


@router.post(
    "/booking-requests/{request_id}/quotes",
    response_model=schemas.QuoteV2Read,
    status_code=status.HTTP_201_CREATED,
)
def create_quote_for_request(
    request_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_service_provider),
):
    """Compatibility wrapper that enforces path/payload agreement."""
    if payload.get("booking_request_id") != request_id:
        raise error_response(
            "Booking request mismatch",
            {"booking_request_id": "Mismatch"},
            status.HTTP_400_BAD_REQUEST,
        )
    quote_in = schemas.QuoteV2Create.model_validate(payload)
    return create_quote(quote_in=quote_in, db=db, current_user=current_user)


@router.post(
    "/quotes", response_model=schemas.QuoteV2Read, status_code=status.HTTP_201_CREATED
)
def create_quote(
    quote_in: schemas.QuoteV2Create,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a quote for a booking request.

    Authorization: only the booking's artist may create quotes for it.
    """
    try:
        # Authorize: ensure the current user is the artist on the booking request
        current_user_id = getattr(current_user, "id", None) if current_user is not None else None
        booking_request = (
            db.query(models.BookingRequest)
            .filter(models.BookingRequest.id == quote_in.booking_request_id)
            .first()
        )
        if not booking_request:
            raise error_response(
                "Booking request not found",
                {"booking_request_id": "not_found"},
                status.HTTP_404_NOT_FOUND,
            )
        if current_user_id is None:
            try:
                current_user_id = int(quote_in.artist_id)
            except Exception:
                current_user_id = quote_in.artist_id
        # If we still cannot identify the caller, fall back to the booking's artist
        # so programmatic callers (tests, background tasks) remain allowed.
        if current_user_id is None:
            current_user_id = booking_request.artist_id
        if booking_request.artist_id != current_user_id:
            logger.warning(
                "Unauthorized quote creation attempt; user_id=%s request_id=%s",
                current_user_id,
                quote_in.booking_request_id,
            )
            raise error_response(
                "Not authorized to create a quote for this request",
                {"booking_request_id": "forbidden"},
                status.HTTP_403_FORBIDDEN,
            )

        quote = crud_quote.create_quote(db, quote_in)
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
                # Best-effort: send a richer transactional email to the client
                # mirroring the provider "New booking request" template flow.
                try:
                    notify_client_new_quote_email(
                        db,
                        client=client,
                        artist=artist,
                        booking_request=booking_request,
                        quote=quote,
                    )
                except Exception:
                    # Email is best-effort; do not block quote creation on failures.
                    pass
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


@router.get("/quotes/v2/batch", response_model=List[schemas.QuoteV2Read])
def get_quotes_batch(
    ids: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Batch fetch QuoteV2 rows (authorized participants only)."""
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip()]
    except Exception:
        raise error_response(
            "Invalid ids parameter",
            {"ids": "comma-separated integers required"},
            status.HTTP_400_BAD_REQUEST,
        )
    if not id_list:
        return []
    results = crud_quote.list_quotes_by_ids(db, id_list)
    permitted: list[models.QuoteV2] = []
    for q in results:
        br = q.booking_request
        if not br:
            continue
        if current_user.id in {br.client_id, br.artist_id}:
            permitted.append(q)
    return [schemas.QuoteV2Read.model_validate(q) for q in permitted]


@router.get("/quotes/v2/me/artist", response_model=List[schemas.QuoteV2Read])
def list_my_artist_quotes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quotes = crud_quote.list_quotes_for_artist(
        db=db, artist_id=current_user.id, skip=skip, limit=limit
    )
    return [schemas.QuoteV2Read.model_validate(q) for q in quotes]


@router.get("/quotes/v2/me/client", response_model=List[schemas.QuoteV2Read])
def list_my_client_quotes(
    status_filter: str | None = Query(default=None, alias="status"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quotes = crud_quote.list_quotes_for_client(
        db=db,
        client_id=current_user.id,
        status=status_filter,
        skip=skip,
        limit=limit,
    )
    return [schemas.QuoteV2Read.model_validate(q) for q in quotes]


@router.get(
    "/booking-requests/{request_id}/quotes-v2",
    response_model=List[schemas.QuoteV2Read],
    response_model_exclude_none=True,
)
def list_quotes_for_booking_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    br = (
        db.query(models.BookingRequest)
        .filter(models.BookingRequest.id == request_id)
        .first()
    )
    if not br:
        raise error_response(
            "Booking request not found",
            {"booking_request_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    if current_user.id not in {br.client_id, br.artist_id}:
        raise error_response(
            "Not authorized to access quotes for this request",
            {"request_id": "forbidden"},
            status.HTTP_403_FORBIDDEN,
        )
    quotes = crud_quote.list_quotes_for_booking_request(db, request_id)
    return [schemas.QuoteV2Read.model_validate(q) for q in quotes]


@router.get("/quotes/{quote_id}", response_model=None)
def read_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    if_none_match: str | None = Header(default=None, convert_underscores=False, alias="If-None-Match"),
):
    """Return a quote plus minimal context for the client/artist participant.

    Authorization: only the booking's client or artist may read the quote.
    """
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
        etag_pre = _quote_etag(quote_id, marker)
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
    # Authorization: only the booking's client or artist can access the quote
    try:
        br = quote.booking_request
        client_id = quote.client_id or (br.client_id if br else None)
        artist_id = quote.artist_id or (br.artist_id if br else None)
        if current_user.id not in {client_id, artist_id}:
            logger.warning(
                "Unauthorized quote read attempt; user_id=%s quote_id=%s",
                current_user.id,
                quote_id,
            )
            raise error_response(
                "Not authorized to access this quote",
                {"quote_id": "forbidden"},
                status.HTTP_403_FORBIDDEN,
            )
    except HTTPException:
        raise
    except Exception:
        # Fail closed on auth errors
        raise error_response(
            "Not authorized to access this quote",
            {"quote_id": "forbidden"},
            status.HTTP_403_FORBIDDEN,
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
    comp_ms = (time.perf_counter() - t_comp_start) * 1000.0
    ser_ms = 0.0
    try:
        t_ser = time.perf_counter()
        body = _json_dumps(payload)
        ser_ms = (time.perf_counter() - t_ser) * 1000.0
    except Exception:
        # Fallback: avoid crashing the endpoint on serialization issues
        body = json.dumps(payload).encode("utf-8")
    # ETag based on updated_at marker
    try:
        marker = quote.updated_at.isoformat(timespec="seconds") if quote.updated_at else "0"
        etag = _quote_etag(quote.id, marker)
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
    current_user: models.User = Depends(get_current_user),
    service_id: int | None = None,
):
    """Accept a pending quote and create a booking.

    Authorization: only the client on the booking request may accept.
    """
    try:
        # Authorization: only the client participant may accept
        quote = crud_quote.get_quote(db, quote_id)
        if not quote:
            try:
                logging.getLogger("app.utils.notifications").error(
                    "Booking request missing when accepting quote_id=%s", quote_id
                )
            except Exception:
                pass
            raise error_response(
                "Booking request missing",
                {"booking_request_id": "not_found"},
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        if current_user.id != quote.client_id:
            logger.warning(
                "Unauthorized quote accept attempt; user_id=%s quote_id=%s",
                current_user.id,
                quote_id,
            )
            raise error_response(
                "Only the client can accept this quote",
                {"quote_id": "forbidden"},
                status.HTTP_403_FORBIDDEN,
            )

        booking = crud_quote.accept_quote(db, quote_id, service_id=service_id)
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
        quote = crud_quote.get_quote(db, quote_id)
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
        quote = crud_quote.get_quote(db, quote_id)
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
def decline_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Decline a pending quote without creating a booking.

    Authorization: only the client on the booking request may decline.
    """
    try:
        # Authorization: only the client participant may decline
        quote = crud_quote.get_quote(db, quote_id)
        if not quote:
            raise error_response(
                "Quote not found",
                {"quote_id": "not_found"},
                status.HTTP_404_NOT_FOUND,
            )
        if current_user.id != quote.client_id:
            logger.warning(
                "Unauthorized quote decline attempt; user_id=%s quote_id=%s",
                current_user.id,
                quote_id,
            )
            raise error_response(
                "Only the client can decline this quote",
                {"quote_id": "forbidden"},
                status.HTTP_403_FORBIDDEN,
            )

        quote = crud_quote.decline_quote(db, quote_id)
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
        quote = crud_quote.get_quote(db, quote_id)
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
        quote = crud_quote.get_quote(db, quote_id)
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


@router.post("/quotes/{quote_id}/withdraw", response_model=schemas.QuoteV2Read)
def withdraw_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Artist-initiated withdraw -> mark rejected."""
    try:
        quote = crud_quote.withdraw_quote(db, quote_id, actor_id=current_user.id)
        return schemas.QuoteV2Read.model_validate(quote)
    except ValueError as exc:
        quote = crud_quote.get_quote(db, quote_id)
        logger.warning(
            "Withdrawing quote failed; quote_id=%s artist_id=%s client_id=%s error=%s",
            quote_id,
            getattr(quote, "artist_id", None),
            getattr(quote, "client_id", None),
            exc,
        )
        raise error_response(
            str(exc), {"quote_id": "invalid"}, status.HTTP_400_BAD_REQUEST
        )
    except Exception:
        raise


@router.get("/quotes/{quote_id}/pdf")
def get_quote_pdf(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quote = crud_quote.get_quote(db, quote_id)
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
