"""Personalized Video orders API backed by booking_requests + service_extras.pv.

When ENABLE_PV_ORDERS is on, this endpoint creates an internal QuoteV2 +
BookingSimple spine and computes pricing server-side.
"""

import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
import httpx
import json

from .dependencies import get_current_active_client, get_current_user, get_db
from ..core.config import settings
from ..crud import crud_video_orders
from ..crud import crud_invoice, crud_message
from .. import models
from ..models import (
    BookingSimple,
    MessageType,
    SenderType,
    VisibleTo,
    QuoteStatusV2,
    QuoteV2,
)
from ..models.booking_request import BookingRequest
from ..models.booking_status import BookingStatus
from ..models.service import Service
from ..models.user import User
from ..schemas.pv import PvPayload, PvStatus
from ..services.pv_orders import can_transition, load_pv_payload, save_pv_payload
from ..services.quote_totals import compute_quote_totals_snapshot, quote_totals_preview_payload

router = APIRouter()
logger = logging.getLogger(__name__)


class PaystackVerifyPayload(BaseModel):
    reference: str


class VideoOrderDeliverPayload(BaseModel):
    delivery_url: Optional[str] = None
    note: Optional[str] = None
    auto_complete_hours: Optional[int] = None
    attachment_url: Optional[str] = None
    attachment_meta: Optional[dict[str, Any]] = None


class VideoOrderCreate(BaseModel):
    artist_id: int
    service_id: Optional[int] = None
    delivery_by_utc: str
    length_sec: int
    language: str
    tone: str
    recipient_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_whatsapp: Optional[str] = None
    promo_code: Optional[str] = None
    # Legacy pricing fields (ignored when ENABLE_PV_ORDERS is on)
    price_base: float = Field(default=0)
    price_rush: float = Field(default=0)
    price_addons: float = Field(default=0)
    discount: float = Field(default=0)
    total: float = Field(default=0)


class VideoOrderTotalsPreview(BaseModel):
    # Keep these as floats (not Decimals) so JSON responses are numbers. The frontend
    # Paystack amount logic relies on this being numeric.
    provider_subtotal: Optional[float] = None
    platform_fee_ex_vat: Optional[float] = None
    platform_fee_vat: Optional[float] = None
    client_total_incl_vat: Optional[float] = None


class VideoOrderResponse(BaseModel):
    id: int
    artist_id: int
    buyer_id: int
    service_id: Optional[int] = None
    status: str
    delivery_by_utc: Optional[str] = None
    delivery_url: Optional[str] = None
    delivery_note: Optional[str] = None
    delivery_attachment_url: Optional[str] = None
    delivery_attachment_meta: Optional[dict[str, Any]] = None
    length_sec: Optional[int] = None
    language: Optional[str] = None
    tone: Optional[str] = None
    price_base: float
    price_rush: float
    price_addons: float
    discount: float
    total: float
    totals_preview: Optional[VideoOrderTotalsPreview] = None
    contact_email: Optional[str] = None
    contact_whatsapp: Optional[str] = None
    answers: dict[str, Any] = Field(default_factory=dict)


class VideoOrderStatusUpdate(BaseModel):
    status: str


class VideoOrderAnswerPayload(BaseModel):
    question_key: str
    value: Any


class VideoOrderPromoPayload(BaseModel):
    promo_code: Optional[str] = None


def _find_pv_service(db: Session, artist_id: int, service_id: Optional[int]) -> Service:
    """Find the personalized video service for the artist or the provided service_id."""
    if service_id:
        svc = (
            db.query(Service)
            .filter(Service.id == service_id)
            .filter(Service.artist_id == artist_id)
            .first()
        )
        if not svc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Service not found",
            )
        st = (getattr(svc, "service_type", "") or "").lower()
        if "personalized video" not in st:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Service is not a Personalized Video service",
            )
        return svc
    svc = (
        db.query(Service)
        .filter(
            Service.artist_id == artist_id,
            Service.service_type.ilike("%personalized video%"),
        )
        .order_by(Service.id.asc())
        .first()
    )
    if not svc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Artist does not have a Personalized Video service",
        )
    return svc


def _map_status_to_booking(status_raw: str) -> BookingStatus:
    s = (status_raw or "").strip().lower()
    if s in {"paid", "in_production", "delivered", "info_pending"}:
        return BookingStatus.REQUEST_CONFIRMED
    if s in {"closed", "completed", "refunded"}:
        return BookingStatus.REQUEST_COMPLETED
    if s in {"cancelled", "canceled"}:
        return BookingStatus.CANCELLED
    return BookingStatus.PENDING


def _parse_delivery_dt(delivery_by_utc: str) -> Optional[datetime]:
    if not delivery_by_utc:
        return None
    raw = str(delivery_by_utc).strip()
    try:
        if len(raw) == 10:  # YYYY-MM-DD
            return datetime.fromisoformat(raw).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def _compute_pv_pricing(svc: Service, payload: VideoOrderCreate) -> dict[str, Any]:
    details = svc.details or {}
    base = Decimal(str(getattr(svc, "price", 0) or 0))
    long_addon = Decimal(str(details.get("long_addon_price") or 0))
    base_length_sec = int(details.get("base_length_sec") or 40)
    length_sec = int(getattr(payload, "length_sec", None) or base_length_sec or 40)
    is_long = length_sec >= 60
    add_on = long_addon if is_long else Decimal("0")

    rush_fee = Decimal("0")
    delivery_dt = _parse_delivery_dt(payload.delivery_by_utc)
    if delivery_dt:
        now = datetime.now(timezone.utc)
        hours = max(0.0, (delivery_dt - now).total_seconds() / 3600.0)
        if hours <= 24:
            rush_fee = (base * Decimal("0.75")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        elif hours <= 48:
            rush_fee = (base * Decimal("0.4")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    subtotal = base + add_on + rush_fee
    promo = (payload.promo_code or "").strip().upper()
    discount = Decimal("0")
    if promo == "SAVE10":
        discount = (subtotal * Decimal("0.1")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    total = subtotal - discount
    if total < Decimal("0"):
        total = Decimal("0")

    return {
        "price_base": base,
        "price_addons": add_on,
        "price_rush": rush_fee,
        "discount": discount,
        "total": total,
        "length_sec": length_sec,
    }


def _pv_state_from_extras(br: BookingRequest) -> dict:
    extras = br.service_extras or {}
    pv = extras.get("pv") or {}
    return {
        "status": pv.get("status", "awaiting_payment"),
        "delivery_by_utc": pv.get("delivery_by_utc"),
        "delivery_url": pv.get("delivery_url"),
        "delivery_note": pv.get("delivery_note"),
        "delivery_attachment_url": pv.get("delivery_attachment_url"),
        "delivery_attachment_meta": pv.get("delivery_attachment_meta"),
        "length_sec": pv.get("length_sec"),
        "language": pv.get("language"),
        "tone": pv.get("tone"),
        "recipient_name": pv.get("recipient_name"),
        "contact_email": pv.get("contact_email"),
        "contact_whatsapp": pv.get("contact_whatsapp"),
        "promo_code": pv.get("promo_code"),
        "price_base": pv.get("price_base", 0),
        "price_rush": pv.get("price_rush", 0),
        "price_addons": pv.get("price_addons", 0),
        "discount": pv.get("discount", 0),
        "total": pv.get("total", float(br.travel_cost or 0) if br.travel_cost is not None else 0),
        "answers": pv.get("answers") or {},
    }


def _write_pv_extras(br: BookingRequest, payload: dict) -> None:
    extras = br.service_extras or {}
    extras["pv"] = payload
    br.service_extras = extras


def _to_video_order_response(
    br: BookingRequest,
    *,
    totals_preview: Optional[dict[str, float]] = None,
) -> VideoOrderResponse:
    pv = load_pv_payload(br)
    return VideoOrderResponse(
        id=br.id,
        artist_id=br.artist_id,
        buyer_id=br.client_id,
        service_id=(int(getattr(br, "service_id", 0) or 0) or None),
        status=str(getattr(pv.status, "value", pv.status) or PvStatus.AWAITING_PAYMENT.value),
        delivery_by_utc=pv.delivery_by_utc,
        delivery_url=pv.delivery_url,
        delivery_note=pv.delivery_note,
        delivery_attachment_url=pv.delivery_attachment_url,
        delivery_attachment_meta=pv.delivery_attachment_meta if isinstance(pv.delivery_attachment_meta, dict) else None,
        length_sec=pv.length_sec,
        language=pv.language,
        tone=pv.tone,
        price_base=float(pv.price_base or 0),
        price_rush=float(pv.price_rush or 0),
        price_addons=float(pv.price_addons or 0),
        discount=float(pv.discount or 0),
        total=float(pv.total or 0),
        totals_preview=(VideoOrderTotalsPreview(**totals_preview) if totals_preview else None),
        contact_email=pv.contact_email,
        contact_whatsapp=pv.contact_whatsapp,
        answers=dict(pv.answers or {}),
    )


@router.post("/video-orders", response_model=VideoOrderResponse, status_code=status.HTTP_201_CREATED)
def create_video_order(
    payload: VideoOrderCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = _find_pv_service(db, payload.artist_id, payload.service_id)
    buyer_email = (payload.contact_email or getattr(current_user, "email", None) or None)

    if settings.ENABLE_PV_ORDERS:
        idem_key = request.headers.get("Idempotency-Key") if request else None
        existing_id = crud_video_orders.idempotency_lookup(db, current_user.id, idem_key)
        if existing_id:
            existing = db.query(BookingRequest).filter(BookingRequest.id == existing_id).first()
            if existing:
                return _to_video_order_response(existing)

        pricing = _compute_pv_pricing(svc, payload)
        br = BookingRequest(
            client_id=current_user.id,
            artist_id=payload.artist_id,
            service_id=svc.id,
            status=BookingStatus.PENDING,
            travel_cost=None,
        )
        pv_payload = PvPayload(
            status=PvStatus.AWAITING_PAYMENT,
            delivery_by_utc=payload.delivery_by_utc,
            length_sec=pricing["length_sec"],
            language=payload.language,
            tone=payload.tone,
            recipient_name=payload.recipient_name,
            contact_email=buyer_email,
            contact_whatsapp=payload.contact_whatsapp,
            promo_code=payload.promo_code,
            price_base=pricing["price_base"],
            price_rush=pricing["price_rush"],
            price_addons=pricing["price_addons"],
            discount=pricing["discount"],
            total=pricing["total"],
            answers={},
            awaiting_payment_at_utc=datetime.utcnow(),
        )
        save_pv_payload(br, pv_payload)
        db.add(br)
        db.commit()
        db.refresh(br)

        provider_total = pricing["total"]
        quote = QuoteV2(
            booking_request_id=br.id,
            artist_id=br.artist_id,
            client_id=br.client_id,
            services=[{"description": "Personalized Video", "price": float(provider_total)}],
            sound_fee=Decimal("0"),
            travel_fee=Decimal("0"),
            subtotal=provider_total,
            discount=pricing["discount"],
            total=provider_total,
            status=QuoteStatusV2.ACCEPTED.value,
            is_internal=True,
        )
        db.add(quote)
        db.commit()
        db.refresh(quote)

        bs_date = _parse_delivery_dt(payload.delivery_by_utc)
        bs = BookingSimple(
            quote_id=quote.id,
            booking_request_id=br.id,
            booking_type="personalized_video",
            artist_id=br.artist_id,
            client_id=br.client_id,
            confirmed=False,
            payment_status="pending",
            date=(bs_date.replace(tzinfo=None) if bs_date else None),
        )
        db.add(bs)
        db.commit()
        db.refresh(bs)

        pv_payload.booking_simple_id = bs.id
        pv_payload.quote_id = quote.id
        save_pv_payload(br, pv_payload)
        db.add(br)
        db.commit()
        db.refresh(br)

        crud_video_orders.record_idempotency(
            db,
            current_user.id,
            idem_key,
            br.id,
            request_hash=payload.model_dump_json(),
        )
        snap = compute_quote_totals_snapshot(quote)
        preview = quote_totals_preview_payload(snap) if snap else None
        return _to_video_order_response(br, totals_preview=preview)

    # Legacy flow (pricing computed client-side)
    br = BookingRequest(
        client_id=current_user.id,
        artist_id=payload.artist_id,
        service_id=svc.id,
        status=BookingStatus.PENDING,
        travel_cost=payload.total,
    )
    _write_pv_extras(
        br,
        {
            "status": "awaiting_payment",
            "delivery_by_utc": payload.delivery_by_utc,
            "length_sec": payload.length_sec,
            "language": payload.language,
            "tone": payload.tone,
            "recipient_name": payload.recipient_name,
            "contact_email": buyer_email,
            "contact_whatsapp": payload.contact_whatsapp,
            "promo_code": payload.promo_code,
            "price_base": payload.price_base,
            "price_rush": payload.price_rush,
            "price_addons": payload.price_addons,
            "discount": payload.discount,
            "total": payload.total,
            "answers": {},
        },
    )
    db.add(br)
    db.commit()
    db.refresh(br)
    return _to_video_order_response(br)


@router.get("/video-orders", response_model=List[VideoOrderResponse])
def list_video_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List Personalized Video orders belonging to the current user.

    Returns orders where the user is either the buyer (client) or artist.
    """
    q = (
        db.query(BookingRequest)
        .filter(
            (BookingRequest.client_id == current_user.id)
            | (BookingRequest.artist_id == current_user.id)
        )
        .order_by(BookingRequest.id.desc())
    )
    try:
        if db.bind and db.bind.dialect.name == "postgresql":
            q = q.filter(text("service_extras::jsonb ? 'pv'"))
    except Exception:
        pass
    rows: List[BookingRequest] = q.all()
    out: List[VideoOrderResponse] = []
    preview_by_br_id: dict[int, dict[str, float] | None] = {}
    if settings.ENABLE_PV_ORDERS and rows:
        try:
            br_ids = [int(r.id) for r in rows if getattr(r, "id", None)]
            if br_ids:
                quotes = (
                    db.query(QuoteV2)
                    .filter(QuoteV2.booking_request_id.in_(br_ids))
                    .filter(QuoteV2.is_internal.is_(True))
                    .order_by(QuoteV2.booking_request_id.asc(), QuoteV2.id.desc())
                    .all()
                )
                seen: set[int] = set()
                for qv2 in quotes:
                    bid = int(getattr(qv2, "booking_request_id", 0) or 0)
                    if not bid or bid in seen:
                        continue
                    seen.add(bid)
                    snap = compute_quote_totals_snapshot(qv2)
                    preview_by_br_id[bid] = quote_totals_preview_payload(snap) if snap else None
        except Exception:
            preview_by_br_id = {}
    for br in rows:
        extras = getattr(br, "service_extras", None)
        if not isinstance(extras, dict):
            continue
        if "pv" not in extras:
            continue
        try:
            out.append(_to_video_order_response(br, totals_preview=preview_by_br_id.get(int(br.id))))
        except Exception:
            # Be defensive; a single malformed row should not break the list.
            continue
    return out


@router.get("/video-orders/{order_id}", response_model=VideoOrderResponse)
def get_video_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    br = db.query(BookingRequest).filter(BookingRequest.id == order_id).first()
    if not br:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if br.client_id != current_user.id and br.artist_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    extras = getattr(br, "service_extras", None)
    if not isinstance(extras, dict) or "pv" not in extras:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if settings.ENABLE_PV_ORDERS:
        quote = (
            db.query(QuoteV2)
            .filter(QuoteV2.booking_request_id == br.id)
            .filter(QuoteV2.is_internal.is_(True))
            .order_by(QuoteV2.id.desc())
            .first()
        )
        snap = compute_quote_totals_snapshot(quote) if quote else None
        preview = quote_totals_preview_payload(snap) if snap else None
        return _to_video_order_response(br, totals_preview=preview)
    return _to_video_order_response(br)


@router.post("/video-orders/{order_id}/promo", response_model=VideoOrderResponse)
def apply_video_order_promo(
    order_id: int,
    payload: VideoOrderPromoPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    br = db.query(BookingRequest).filter(BookingRequest.id == order_id).first()
    if not br:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if br.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    extras = getattr(br, "service_extras", None)
    if not isinstance(extras, dict) or "pv" not in extras:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    pv = load_pv_payload(br)
    status_raw = str(getattr(pv.status, "value", pv.status) or "")
    if status_raw.lower() not in {"awaiting_payment", "draft"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Promo codes can only be applied before payment.",
        )

    code = (payload.promo_code or "").strip().upper()
    if code and code != "SAVE10":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid promo code.",
        )

    svc = _find_pv_service(db, br.artist_id, getattr(br, "service_id", None))
    pricing = _compute_pv_pricing(
        svc,
        VideoOrderCreate(
            artist_id=br.artist_id,
            service_id=getattr(br, "service_id", None),
            delivery_by_utc=pv.delivery_by_utc or "",
            length_sec=int(pv.length_sec or 0) or int((svc.details or {}).get("base_length_sec") or 40),
            language=str(pv.language or "EN"),
            tone=str(pv.tone or "Cheerful"),
            recipient_name=pv.recipient_name,
            contact_email=pv.contact_email,
            contact_whatsapp=pv.contact_whatsapp,
            promo_code=code or None,
            price_base=0,
            price_rush=0,
            price_addons=0,
            discount=0,
            total=0,
        ),
    )

    pv.promo_code = code or None
    pv.price_base = pricing["price_base"]
    pv.price_rush = pricing["price_rush"]
    pv.price_addons = pricing["price_addons"]
    pv.discount = pricing["discount"]
    pv.total = pricing["total"]
    save_pv_payload(br, pv)

    preview = None
    if settings.ENABLE_PV_ORDERS:
        quote = (
            db.query(QuoteV2)
            .filter(QuoteV2.booking_request_id == br.id)
            .filter(QuoteV2.is_internal.is_(True))
            .order_by(QuoteV2.id.desc())
            .first()
        )
        if quote:
            provider_total = pricing["total"]
            quote.services = [{"description": "Personalized Video", "price": float(provider_total)}]
            quote.subtotal = provider_total
            quote.discount = pricing["discount"]
            quote.total = provider_total
            db.add(quote)

    else:
        # Legacy: total stored in travel_cost for reads.
        try:
            br.travel_cost = float(pricing["total"])
        except Exception:
            pass

    db.add(br)
    db.commit()
    db.refresh(br)

    if settings.ENABLE_PV_ORDERS:
        quote = (
            db.query(QuoteV2)
            .filter(QuoteV2.booking_request_id == br.id)
            .filter(QuoteV2.is_internal.is_(True))
            .order_by(QuoteV2.id.desc())
            .first()
        )
        snap = compute_quote_totals_snapshot(quote) if quote else None
        preview = quote_totals_preview_payload(snap) if snap else None

    return _to_video_order_response(br, totals_preview=preview)


@router.post("/video-orders/{order_id}/status", response_model=VideoOrderResponse)
def update_video_order_status(
    order_id: int,
    payload: VideoOrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    br = db.query(BookingRequest).filter(BookingRequest.id == order_id).first()
    if not br:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if br.client_id != current_user.id and br.artist_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if settings.ENABLE_PV_ORDERS:
        pv = load_pv_payload(br)
        role = "client" if br.client_id == current_user.id else "artist"
        if not can_transition(pv.status, role, payload.status):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid status transition",
            )
        try:
            new_status = PvStatus(str(payload.status))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unknown status",
            )
        if pv.status != new_status:
            pv.status = new_status
            now = datetime.utcnow()
            if new_status == PvStatus.PAID:
                pv.paid_at_utc = pv.paid_at_utc or now
            elif new_status == PvStatus.IN_PRODUCTION:
                pv.in_production_at_utc = pv.in_production_at_utc or now
            elif new_status == PvStatus.DELIVERED:
                pv.delivered_at_utc = pv.delivered_at_utc or now
            elif new_status == PvStatus.COMPLETED:
                pv.completed_at_utc = pv.completed_at_utc or now
            elif new_status == PvStatus.CANCELLED:
                pv.cancelled_at_utc = pv.cancelled_at_utc or now
            elif new_status == PvStatus.REFUNDED:
                pv.refunded_at_utc = pv.refunded_at_utc or now
        save_pv_payload(br, pv)
        br.status = _map_status_to_booking(payload.status)
        db.add(br)
        db.commit()
        db.refresh(br)
        return _to_video_order_response(br)

    pv = _pv_state_from_extras(br)
    pv["status"] = payload.status
    _write_pv_extras(br, pv)
    br.status = _map_status_to_booking(payload.status)
    db.add(br)
    db.commit()
    db.refresh(br)
    return _to_video_order_response(br)


@router.post("/video-orders/{order_id}/answers")
def upsert_video_order_answer(
    order_id: int,
    payload: VideoOrderAnswerPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Store or update a single brief answer for a Personalized Video order.

    Answers are kept under service_extras.pv["answers"] keyed by question_key.
    """
    br = db.query(BookingRequest).filter(BookingRequest.id == order_id).first()
    if not br:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if br.client_id != current_user.id and br.artist_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if settings.ENABLE_PV_ORDERS and br.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client only")

    if settings.ENABLE_PV_ORDERS:
        pv = load_pv_payload(br)
        answers = dict(pv.answers or {})
        answers[payload.question_key] = payload.value
        pv.answers = answers
        save_pv_payload(br, pv)
    else:
        pv = _pv_state_from_extras(br)
        answers: dict[str, Any] = {}
        raw_answers = pv.get("answers")
        if isinstance(raw_answers, dict):
            answers.update(raw_answers)
        answers[payload.question_key] = payload.value
        pv["answers"] = answers
        _write_pv_extras(br, pv)
    db.add(br)
    db.commit()
    return {"ok": True}


@router.post("/video-orders/{order_id}/deliver", response_model=VideoOrderResponse)
def deliver_video_order(
    order_id: int,
    body: VideoOrderDeliverPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a PV v2 order as delivered (artist-only) and set auto-complete horizon."""
    if not settings.ENABLE_PV_ORDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    br = db.query(BookingRequest).filter(BookingRequest.id == order_id).first()
    if not br:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if br.artist_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    pv = load_pv_payload(br)
    prev_status = pv.status
    prev_delivery_url = pv.delivery_url
    prev_attachment_url = pv.delivery_attachment_url
    now = datetime.utcnow()
    status_raw = str(getattr(pv.status, "value", pv.status) or "").strip().lower()
    if status_raw == PvStatus.PAID.value:
        # Allow artists to deliver from PAID by implicitly moving the order into production.
        pv.in_production_at_utc = pv.in_production_at_utc or now
        pv.status = PvStatus.IN_PRODUCTION
        status_raw = PvStatus.IN_PRODUCTION.value
    if status_raw == PvStatus.AWAITING_PAYMENT.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment required before delivery")
    if not can_transition(pv.status, "artist", PvStatus.DELIVERED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status transition")
    if pv.status != PvStatus.DELIVERED:
        pv.status = PvStatus.DELIVERED
    pv.delivered_at_utc = pv.delivered_at_utc or now

    hours = int(body.auto_complete_hours or 72)
    if hours < 1:
        hours = 1
    if hours > 168:
        hours = 168
    pv.auto_complete_at_utc = pv.auto_complete_at_utc or (now + timedelta(hours=hours))

    try:
        fields_set = set(getattr(body, "model_fields_set", set()) or set())
    except Exception:
        fields_set = set()

    # Allow updating/clearing delivery fields even after the order is delivered.
    if "delivery_url" in fields_set:
        cleaned = str(body.delivery_url or "").strip()
        if cleaned in {"-", "—", "–"}:
            cleaned = ""
        pv.delivery_url = cleaned or None
    if "note" in fields_set:
        cleaned = str(body.note or "").strip()
        pv.delivery_note = cleaned or None
    if "attachment_url" in fields_set:
        cleaned = str(body.attachment_url or "").strip()
        pv.delivery_attachment_url = cleaned or None
        if not pv.delivery_attachment_url:
            pv.delivery_attachment_meta = None
        elif "attachment_meta" in fields_set and isinstance(body.attachment_meta, dict):
            pv.delivery_attachment_meta = body.attachment_meta
    if "attachment_meta" in fields_set and pv.delivery_attachment_url and isinstance(body.attachment_meta, dict):
        pv.delivery_attachment_meta = body.attachment_meta

    first_delivery = prev_status != PvStatus.DELIVERED and pv.status == PvStatus.DELIVERED
    # On first delivery, require at least one delivery mechanism (link or attachment).
    if first_delivery and not (pv.delivery_url or pv.delivery_attachment_url):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a delivery link or upload a delivery attachment",
        )

    delivery_changed = pv.delivery_url != prev_delivery_url or pv.delivery_attachment_url != prev_attachment_url

    save_pv_payload(br, pv)
    br.status = _map_status_to_booking(PvStatus.DELIVERED.value)
    db.add(br)
    db.commit()
    db.refresh(br)

    # Emit a message (with optional attachment) so both parties see the delivery in chat.
    # Only send a new message when delivery is first set or the link/file changes.
    if (first_delivery or delivery_changed) and (pv.delivery_url or pv.delivery_attachment_url):
        try:
            parts: list[str] = [
                "Your personalised video has been delivered."
                if first_delivery
                else "Personalised video delivery updated.",
            ]
            if pv.delivery_url:
                parts.append(f"Link: {str(pv.delivery_url).strip()}")
            if pv.delivery_note:
                parts.append(str(pv.delivery_note).strip())
            content = " ".join([p for p in parts if p]).strip()
            crud_message.create_message(
                db=db,
                booking_request_id=br.id,
                sender_id=current_user.id,
                sender_type=SenderType.ARTIST,
                content=content,
                message_type=MessageType.USER,
                visible_to=VisibleTo.BOTH,
                attachment_url=pv.delivery_attachment_url,
                attachment_meta=pv.delivery_attachment_meta if isinstance(pv.delivery_attachment_meta, dict) else None,
            )
        except Exception:
            pass

    return _to_video_order_response(br)


@router.post("/video-orders/{order_id}/paystack/verify", response_model=VideoOrderResponse)
def verify_video_order_paystack(
    order_id: int,
    body: PaystackVerifyPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_client),
):
    """Verify a Paystack charge for PV v2 orders (feature-flagged)."""
    if not settings.ENABLE_PV_ORDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not settings.PAYSTACK_SECRET_KEY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paystack not configured")

    br = db.query(BookingRequest).filter(BookingRequest.id == order_id).first()
    if not br or br.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    pv = load_pv_payload(br)
    # Ensure this request is PV-backed
    if pv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    # Resolve internal quote + booking_simple spine
    quote = (
        db.query(QuoteV2)
        .filter(QuoteV2.booking_request_id == br.id)
        .filter(QuoteV2.is_internal.is_(True))
        .order_by(QuoteV2.id.desc())
        .first()
    )
    if not quote:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    simple = (
        db.query(BookingSimple)
        .filter(BookingSimple.booking_request_id == br.id)
        .filter(BookingSimple.booking_type == "personalized_video")
        .first()
    )
    if not simple:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    # Call Paystack verify
    headers = {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(
                f"https://api.paystack.co/transaction/verify/{body.reference}",
                headers=headers,
            )
            r.raise_for_status()
            data = r.json().get("data", {})
        status_str = str(data.get("status", "")).lower()
        amount_kobo = int(data.get("amount", 0) or 0)
    except Exception as exc:
        logger.error("PV Paystack verify error: %s", exc, exc_info=True)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Verification failed")

    if status_str != "success":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment not successful")

    snap = compute_quote_totals_snapshot(quote)
    if not snap:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid quote total")
    expected_kobo = int((snap.client_total_incl_vat * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if amount_kobo != expected_kobo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount mismatch (expected {expected_kobo}, got {amount_kobo})",
        )

    # Idempotency: if already paid, return current order
    if str(getattr(simple, "payment_status", "")).lower() == "paid":
        return _to_video_order_response(br)

    amount = (snap.client_total_incl_vat or Decimal("0")).quantize(Decimal("0.01"))
    simple.payment_status = "paid"
    simple.payment_id = body.reference
    simple.charged_total_amount = amount
    simple.confirmed = True
    db.add(simple)
    db.commit()
    db.refresh(simple)

    # Ledger entries (mirror standard verify, skip payouts)
    try:
        existing_rows = db.execute(
            text(
                "SELECT type, meta FROM ledger_entries WHERE booking_id = :bid ORDER BY id DESC LIMIT 200"
            ),
            {"bid": simple.id},
        ).fetchall()

        def _meta_has(type_: str, split: str | None = None) -> bool:
            for row in existing_rows:
                try:
                    if str(row[0]) != type_:
                        continue
                    m = row[1] or {}
                    if isinstance(m, str):
                        m = json.loads(m)
                    if m.get("reference") == body.reference and (
                        split is None or m.get("split") == split
                    ):
                        return True
                except Exception:
                    continue
            return False

        if not _meta_has("charge"):
            db.execute(
                text(
                    "INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) "
                    "VALUES (:bid, 'charge', :amt, 'ZAR', :meta)"
                ),
                {
                    "bid": simple.id,
                    "amt": float(amount),
                    "meta": json.dumps(
                        {
                            "gateway": "paystack",
                            "reference": body.reference,
                            "phase": "verify_pv",
                        }
                    ),
                },
            )

        # Provider net split (reuse same math as standard verify)
        services_total = 0.0
        try:
            if quote and isinstance(quote.services, list):
                for s in quote.services:
                    services_total += float(s.get("price") or 0)
        except Exception:
            services_total = 0.0
        pass_through = float(getattr(quote, "travel_fee", 0) or 0) + float(
            getattr(quote, "sound_fee", 0) or 0
        )
        discount_ex = float(getattr(quote, "discount", 0) or 0)
        # Env rates
        COMMISSION_RATE = float(getattr(settings, "COMMISSION_RATE", None) or 0.075)
        VAT_RATE = float(getattr(settings, "VAT_RATE", None) or 0.15)
        commissionable_base = round(max(0.0, (services_total + pass_through) - discount_ex), 2)
        commission = round(commissionable_base * COMMISSION_RATE, 2)
        vat_on_commission = round(commission * VAT_RATE, 2)
        supplier_vat_rate = 0.0
        try:
            prof = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == int(simple.artist_id))
                .first()
            )
            if settings.ENABLE_AGENT_PAYOUT_VAT and prof and bool(getattr(prof, "vat_registered", False)):
                raw_rate = getattr(prof, "vat_rate", None)
                try:
                    r = float(raw_rate) if raw_rate is not None else VAT_RATE
                    supplier_vat_rate = r / 100.0 if r > 1.0 else r
                except Exception:
                    supplier_vat_rate = VAT_RATE
        except Exception:
            supplier_vat_rate = 0.0
        supplier_vat_amount = round(commissionable_base * supplier_vat_rate, 2)
        provider_net_total = round(
            (commissionable_base + supplier_vat_amount) - commission - vat_on_commission,
            2,
        )
        first_stage_amt = round(provider_net_total / 2.0, 2)
        final_stage_amt = round(provider_net_total - first_stage_amt, 2)

        if not _meta_has("provider_escrow_in", split="first50"):
            db.execute(
                text(
                    "INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) "
                    "VALUES (:bid, 'provider_escrow_in', :amt, 'ZAR', :meta)"
                ),
                {
                    "bid": simple.id,
                    "amt": float(first_stage_amt),
                    "meta": json.dumps(
                        {
                            "gateway": "paystack",
                            "reference": body.reference,
                            "phase": "verify_pv",
                            "split": "first50",
                        }
                    ),
                },
            )
        if not _meta_has("provider_escrow_hold", split="held50"):
            db.execute(
                text(
                    "INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) "
                    "VALUES (:bid, 'provider_escrow_hold', :amt, 'ZAR', :meta)"
                ),
                {
                    "bid": simple.id,
                    "amt": float(final_stage_amt),
                    "meta": json.dumps(
                        {
                            "gateway": "paystack",
                            "reference": body.reference,
                            "phase": "verify_pv",
                            "split": "held50",
                        }
                    ),
                },
            )
        db.commit()
    except Exception:
        db.rollback()

    # Invoices (best-effort)
    try:
        inv = crud_invoice.ensure_invoice_for_booking(db, quote, simple)
        if inv is not None:
            status_val = getattr(inv, "status", None)
            is_paid = str(getattr(status_val, "value", status_val) or "").lower() == "paid"
            if not is_paid:
                crud_invoice.mark_paid(db, inv, payment_method="paystack", notes=f"ref {body.reference}")
    except Exception:
        pass

    # Update PV payload + BR status
    pv.status = PvStatus.PAID
    pv.paid_at_utc = pv.paid_at_utc or datetime.utcnow()
    pv.paystack_reference = body.reference
    pv.payout_state = pv.payout_state or "reserved"
    save_pv_payload(br, pv)
    br.status = BookingStatus.REQUEST_CONFIRMED
    db.add(br)
    db.commit()
    db.refresh(br)

    # Emit payment received system message
    try:
        receipt_url = f"{settings.FRONTEND_URL}/receipts/{body.reference}"
    except Exception:
        receipt_url = None
    content = (
        f"Payment received. Booking confirmed. Receipt: {receipt_url}"
        if receipt_url
        else "Payment received. Booking confirmed."
    )
    try:
        crud_message.create_message(
            db=db,
            booking_request_id=br.id,
            sender_id=br.artist_id,
            sender_type=SenderType.ARTIST,
            content=content,
            message_type=MessageType.SYSTEM,
            visible_to=VisibleTo.BOTH,
            system_key="payment_received_v1",
        )
    except Exception:
        pass

    preview = quote_totals_preview_payload(snap) if snap else None
    return _to_video_order_response(br, totals_preview=preview)
