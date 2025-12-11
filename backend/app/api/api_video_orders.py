"""Personalized Video orders API backed by booking_requests + service_extras.pv."""

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..dependencies import get_db
from ..models.booking_request import BookingRequest
from ..models.booking_status import BookingStatus
from ..models.service import Service
from ..models.user import User
from ..lib.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


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
    price_base: float
    price_rush: float
    price_addons: float
    discount: float
    total: float


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
        svc = db.query(Service).filter(Service.id == service_id).first()
        if not svc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Service not found",
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
    if s in {"paid", "in_production", "info_pending"}:
        return BookingStatus.REQUEST_CONFIRMED
    if s in {"delivered", "closed", "completed"}:
        return BookingStatus.REQUEST_COMPLETED
    return BookingStatus.PENDING


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


def _to_video_order_response(br: BookingRequest) -> VideoOrderResponse:
    pv = _pv_state_from_extras(br)
    return VideoOrderResponse(
        id=br.id,
        artist_id=br.artist_id,
        buyer_id=br.client_id,
        status=pv["status"],
        delivery_by_utc=pv["delivery_by_utc"],
        length_sec=pv["length_sec"],
        language=pv["language"],
        tone=pv["tone"],
        price_base=float(pv["price_base"] or 0),
        price_rush=float(pv["price_rush"] or 0),
        price_addons=float(pv["price_addons"] or 0),
        discount=float(pv["discount"] or 0),
        total=float(pv["total"] or 0),
        contact_email=pv["contact_email"],
        contact_whatsapp=pv["contact_whatsapp"],
    )


@router.post("/video-orders", response_model=VideoOrderResponse, status_code=status.HTTP_201_CREATED)
def create_video_order(
    payload: VideoOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = _find_pv_service(db, payload.artist_id, payload.service_id)

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
    rows: List[BookingRequest] = (
        db.query(BookingRequest)
        .filter(
            (BookingRequest.client_id == current_user.id)
            | (BookingRequest.artist_id == current_user.id)
        )
        .order_by(BookingRequest.id.desc())
        .all()
    )
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
