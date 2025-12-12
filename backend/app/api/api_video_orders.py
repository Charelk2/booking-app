"""Personalized Video orders API backed by booking_requests + service_extras.pv.

When ENABLE_PV_ORDERS is on, this endpoint creates an internal QuoteV2 +
BookingSimple spine and computes pricing server-side.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from .dependencies import get_current_user, get_db
from ..core.config import settings
from ..crud import crud_video_orders
from ..models import BookingSimple, QuoteStatusV2, QuoteV2
from ..models.booking_request import BookingRequest
from ..models.booking_status import BookingStatus
from ..models.service import Service
from ..models.user import User
from ..schemas.quote_v2 import QuoteTotalsPreview
from ..schemas.pv import PvPayload, PvStatus
from ..services.pv_orders import can_transition, load_pv_payload, save_pv_payload
from ..services.quote_totals import compute_quote_totals_snapshot, quote_totals_preview_payload

router = APIRouter()
logger = logging.getLogger(__name__)


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


class VideoOrderResponse(BaseModel):
    id: int
    artist_id: int
    buyer_id: int
    status: str
    delivery_by_utc: Optional[str] = None
    length_sec: Optional[int] = None
    language: Optional[str] = None
    tone: Optional[str] = None
    price_base: float
    price_rush: float
    price_addons: float
    discount: float
    total: float
    totals_preview: Optional[QuoteTotalsPreview] = None
    contact_email: Optional[str] = None
    contact_whatsapp: Optional[str] = None


class VideoOrderStatusUpdate(BaseModel):
    status: str


class VideoOrderAnswerPayload(BaseModel):
    question_key: str
    value: Any


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
        status=str(getattr(pv.status, "value", pv.status) or PvStatus.AWAITING_PAYMENT.value),
        delivery_by_utc=pv.delivery_by_utc,
        length_sec=pv.length_sec,
        language=pv.language,
        tone=pv.tone,
        price_base=float(pv.price_base or 0),
        price_rush=float(pv.price_rush or 0),
        price_addons=float(pv.price_addons or 0),
        discount=float(pv.discount or 0),
        total=float(pv.total or 0),
        totals_preview=(QuoteTotalsPreview(**totals_preview) if totals_preview else None),
        contact_email=pv.contact_email,
        contact_whatsapp=pv.contact_whatsapp,
    )


@router.post("/video-orders", response_model=VideoOrderResponse, status_code=status.HTTP_201_CREATED)
def create_video_order(
    payload: VideoOrderCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = _find_pv_service(db, payload.artist_id, payload.service_id)
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
            contact_email=payload.contact_email,
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
            "contact_email": payload.contact_email,
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
    for br in rows:
        extras = getattr(br, "service_extras", None)
        if not isinstance(extras, dict):
            continue
        if "pv" not in extras:
            continue
        try:
            out.append(_to_video_order_response(br))
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
    return _to_video_order_response(br)


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
