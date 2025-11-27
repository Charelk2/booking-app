from __future__ import annotations

from datetime import datetime, timedelta
import os
import uuid
from typing import List, Optional
from pydantic import BaseModel

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .dependencies import get_current_service_provider, get_current_user
from .. import crud
from ..models.sound_outreach import OutreachStatus
from ..models.service import Service, ServiceType
from ..utils import error_response
from ..utils.notifications import (
    notify_service_request,
    notify_service_nudge,
    notify_user_new_booking_request,
)

router = APIRouter(tags=["sound-outreach"])


class SoundRetryIn(BaseModel):
    """Payload for retrying sound outreach (JSON body)."""

    event_city: str | None = None


def _preferred_suppliers_for_city(
    *, service: Service, event_city: str
) -> List[int]:
    details = service.details or {}
    sound = details.get("sound_provisioning") or {}
    prefs = sound.get("city_preferences") or []
    for pref in prefs:
        if str(pref.get("city", "")).lower() == event_city.lower():
            ids = pref.get("provider_ids") or []
            return [int(x) for x in ids][:3]
    # No exact city match; fallback to first 3 across prefs
    for pref in prefs:
        ids = pref.get("provider_ids") or []
        if ids:
            return [int(x) for x in ids][:3]
    return []


def _fallback_sound_services(
    db: Session, *, artist_id: int, event_city: str, limit: int = 3
) -> List[int]:
    # Heuristic: pick other services of category "Sound Service" that mention the city in details.coverage or title.
    q = (
        db.query(Service)
        .filter(Service.service_category.has(models.ServiceCategory.name == "Sound Service"))
    )
    results: List[int] = []
    for s in q.limit(50):
        det = s.details or {}
        coverage = ",".join(det.get("coverage", [])).lower()
        if event_city.lower() in coverage or event_city.lower() in (s.title or "").lower():
            results.append(int(s.id))
        if len(results) >= limit:
            break
    return results


def _ensure_client_sound_booking_for_supplier(
    db: Session,
    *,
    booking: models.Booking,
    parent_br: models.BookingRequest,
    supplier_service: models.Service,
    supplier_public_name: str | None,
) -> None:
    """Create a client-facing sound booking thread if one does not exist yet.

    This is safe to call multiple times; it checks for an existing child
    BookingRequest linked to the parent and supplier and returns if found.
    """
    try:
        existing = (
            db.query(models.BookingRequest)
            .filter(
                models.BookingRequest.parent_booking_request_id == parent_br.id,
                models.BookingRequest.artist_id == supplier_service.artist_id,
            )
            .first()
        )
        if existing:
            return
    except Exception:
        existing = None
    try:
        proposed_dt = booking.start_time or parent_br.proposed_datetime_1
        artist_label = None
        try:
            artist_profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == booking.artist_id)
                .first()
            )
            artist_label = (
                artist_profile.business_name
                if artist_profile and artist_profile.business_name
                else getattr(booking.service, "title", None)
                or "your artist"
            )
        except Exception:
            artist_label = getattr(booking.service, "title", None) or "your artist"
        city = booking.event_city or (
            (parent_br.travel_breakdown or {}).get("event_city")
            if isinstance(parent_br.travel_breakdown, dict)
            else None
        )
        base_msg = "Sound booking for your event"
        if artist_label:
            base_msg += f" with {artist_label}"
        if city:
            base_msg += f" in {city}"
        base_msg += "."
        client_facing_req = schemas.BookingRequestCreate(
            artist_id=supplier_service.artist_id,
            service_id=supplier_service.id,
            message=base_msg + " Please review details and send a quote for sound.",
            proposed_datetime_1=proposed_dt,
            travel_mode=parent_br.travel_mode,
            travel_cost=None,
            travel_breakdown=parent_br.travel_breakdown,
            status=models.BookingStatus.PENDING_QUOTE,
            parent_booking_request_id=parent_br.id,
        )
        client_id = int(parent_br.client_id)
        child_br = crud.crud_booking_request.create_booking_request(
            db,
            booking_request=client_facing_req,
            client_id=client_id,
        )
        db.commit()
        db.refresh(child_br)
        try:
            supplier_name = supplier_public_name or "a sound supplier"
            link_msg_parts = [
                f"This chat is for sound for your booking with {artist_label or 'your artist'}.",
                f"We’ve opened it with {supplier_name} so they can send a sound quote here.",
                "You’ll pay them separately after your main artist booking is paid.",
            ]
            link_msg = " ".join(link_msg_parts)
            crud.crud_message.create_message(
                db=db,
                booking_request_id=child_br.id,
                sender_id=booking.artist_id,
                sender_type=models.SenderType.ARTIST,
                content=link_msg,
                message_type=models.MessageType.SYSTEM,
                visible_to=models.VisibleTo.BOTH,
            )
            db.commit()
        except Exception:
            db.rollback()
    except Exception:
        # best-effort only
        try:
            db.rollback()
        except Exception:
            pass


@router.post("/bookings/{booking_id}/sound/outreach", status_code=status.HTTP_202_ACCEPTED)
def kickoff_sound_outreach(
    booking_id: int,
    *,
    event_city: str,
    request_timeout_hours: Optional[int] = 24,
    mode: str = "sequential",  # or "simultaneous"
    selected_service_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_service_provider),
):
    """Start supplier outreach for a booking that requires sound.

    The event_city is required so we can choose supplier coverage correctly.
    """
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise error_response(
            "Booking not found",
            {"booking_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    if booking.artist_id != current_artist.id:
        raise error_response(
            "Not authorized to start outreach for this booking",
            {"booking_id": "forbidden"},
            status.HTTP_403_FORBIDDEN,
        )

    service = db.query(models.Service).filter(models.Service.id == booking.service_id).first()
    if not service:
        raise error_response(
            "Service not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    # Resolve candidates
    preferred_ids = _preferred_suppliers_for_city(service=service, event_city=event_city)
    if len(preferred_ids) < 3:
        preferred_ids = preferred_ids + _fallback_sound_services(db, artist_id=service.artist_id, event_city=event_city)[: 3 - len(preferred_ids)]

    # Rank candidates: preferred weight → reliability (desc). Distance/estimate can be added when provided by client.
    ranked: list[int] = []
    candidates = []
    for sid in preferred_ids:
        ssvc = crud.service.get_service(db, sid)
        if not ssvc:
            continue
        pb = (
            db.query(models.SupplierPricebook)
            .filter(models.SupplierPricebook.service_id == sid)
            .first()
        )
        reliability = float(pb.reliability_score) if pb and pb.reliability_score is not None else 0.0
        pref_weight = 0 if sid in preferred_ids[:1] else (0 if sid in preferred_ids else 1)
        candidates.append((sid, pref_weight, -reliability))
    for sid, _, _ in sorted(candidates, key=lambda t: (t[1], t[2])):
        ranked.append(sid)

    if selected_service_id and selected_service_id in ranked:
        # If explicitly selected, contact only that supplier first
        ranked = [selected_service_id]

    if not ranked:
        # Nothing to contact; keep artist booking intact and release sound hold if any
        try:
            bs = (
                db.query(models.BookingSimple)
                .filter(models.BookingSimple.quote_id == booking.quote_id)
                .first()
            )
            if bs and bs.sound_hold_status == "authorized":
                bs.sound_hold_status = "released"
                db.add(bs)
        except Exception:
            pass
        db.commit()
        return {"status": "no_candidates"}

    # Don’t duplicate if active request exists
    active = crud.crud_sound.sound_orchestrator.get_active_outreach_for_booking(db, booking.id)
    if active:
        return {"status": "already_in_progress"}

    expires_at = None
    if request_timeout_hours and request_timeout_hours > 0:
        expires_at = datetime.utcnow() + timedelta(hours=request_timeout_hours)

    # Resolve parent booking request for linked artist/supplier threads
    parent_br = None
    sound_mode = None
    try:
        parent_booking_request_id = None
        if booking.quote_id:
            try:
                qv2_parent = (
                    db.query(models.QuoteV2)
                    .filter(models.QuoteV2.id == booking.quote_id)
                    .first()
                )
                if qv2_parent:
                    parent_booking_request_id = int(qv2_parent.booking_request_id)
            except Exception:
                parent_booking_request_id = None
        tb: dict = {}
        if parent_booking_request_id:
            parent_br = (
                db.query(models.BookingRequest)
                .filter(models.BookingRequest.id == parent_booking_request_id)
                .first()
            )
            try:
                if parent_br and isinstance(parent_br.travel_breakdown, dict):
                    tb = dict(parent_br.travel_breakdown or {})
                    sound_mode = tb.get("sound_mode")
            except Exception:
                sound_mode = None
        # Determine whether this outreach run represents supplier‑mode sound.
        supplier_mode = False
        try:
            if isinstance(sound_mode, str) and sound_mode.lower() == "supplier":
                supplier_mode = True
            else:
                # Fallback: if a specific supplier was selected in the wizard
                # (stored in travel_breakdown) or passed explicitly as
                # selected_service_id, treat this as supplier mode. This keeps
                # the client-facing sound thread creation resilient even when
                # sound_mode is missing or legacy.
                sel_from_tb = tb.get("selected_sound_service_id")
                if (sel_from_tb and int(sel_from_tb or 0) > 0) or (selected_service_id and selected_service_id > 0):
                    supplier_mode = True
        except Exception:
            supplier_mode = bool(selected_service_id and selected_service_id > 0)
    except Exception:
        parent_br = None
        sound_mode = None
        supplier_mode = False

    # Create rows
    created: List[models.sound_outreach.SoundOutreachRequest] = []  # type: ignore[attr-defined]
    for idx, sid in enumerate(ranked[:3]):
        supplier_service = crud.service.get_service(db, sid)
        if not supplier_service:
            continue
        public_name: Optional[str] = None
        # White‑label: prefer details.publicName if present; else profile business_name; else service title
        if isinstance(supplier_service.details, dict):
            public_name = supplier_service.details.get("publicName")
        if not public_name:
            artist_profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == supplier_service.artist_id)
                .first()
            )
            public_name = artist_profile.business_name if artist_profile and artist_profile.business_name else supplier_service.title

        row = crud.crud_sound.sound_orchestrator.create_outbound(
            db,
            booking_id=booking.id,
            supplier_service_id=sid,
            expires_at=expires_at,
            supplier_public_name=public_name,
        )
        # Create a supplier-facing booking request thread so they can ask questions and send a quote
        try:
            supplier_request = crud.crud_booking_request.create_booking_request(
                db,
                booking_request=schemas.BookingRequestCreate(
                    artist_id=supplier_service.artist_id,
                    service_id=supplier_service.id,
                    message=(
                        f"Sound request for booking #{booking.id} in {event_city}. "
                        f"Artist: {service.title}. Please send a firm quote."
                    ),
                    status=models.BookingStatus.PENDING_QUOTE,
                ),
                client_id=current_artist.id,
            )
            # Post a system message with a clear CTA
            crud.crud_message.create_message(
                db,
                booking_request_id=supplier_request.id,
                sender_id=current_artist.id,
                sender_type=models.SenderType.ARTIST,
                content=(
                    "New sound request created by the artist. Please send a firm price "
                    "or ask questions if needed."
                ),
                message_type=models.MessageType.SYSTEM,
                visible_to=models.VisibleTo.BOTH,
                action=models.MessageAction.REVIEW_QUOTE,
                expires_at=expires_at,
            )
            # Link the thread to outreach for auditing
            row.supplier_booking_request_id = supplier_request.id
            db.add(row)
            db.commit()
            db.refresh(row)
        except Exception:
            pass
        created.append(row)

        # For supplier mode, create a client-facing sound booking thread
        # immediately for the first candidate so the client sees both the
        # artist and sound booking threads without waiting for supplier
        # acceptance.
        if idx == 0 and parent_br and supplier_mode:
            try:
                _ensure_client_sound_booking_for_supplier(
                    db,
                    booking=booking,
                    parent_br=parent_br,
                    supplier_service=supplier_service,
                    supplier_public_name=public_name,
                )
            except Exception:
                pass

        # Notify supplier with secure respond URL
        try:
            lock_url = f"/supplier/respond?booking_id={booking.id}&service_id={sid}&token={row.lock_token}"
            notify_service_request(supplier_service, booking, expires_at, lock_url)  # type: ignore[arg-type]
            # Also persist a notification so offline suppliers see it in their inbox
            try:
                supplier_user = db.query(models.User).filter(models.User.id == supplier_service.artist_id).first()
                # Sender display: prefer current artist profile business name if available
                sender_display = None
                try:
                    artist_profile = (
                        db.query(models.ServiceProviderProfile)
                        .filter(models.ServiceProviderProfile.user_id == current_artist.id)
                        .first()
                    )
                    if artist_profile and artist_profile.business_name:
                        sender_display = artist_profile.business_name
                    else:
                        sender_display = f"{current_artist.first_name} {current_artist.last_name}"
                except Exception:
                    sender_display = f"{current_artist.first_name} {current_artist.last_name}"
                if supplier_user:
                    notify_user_new_booking_request(
                        db,
                        user=supplier_user,
                        request_id=int(row.supplier_booking_request_id or 0) or supplier_request.id,
                        sender_name=sender_display or "Artist",
                        booking_type="Sound Service",
                    )
            except Exception:
                pass
        except Exception:
            pass

    # Move booking into pending_sound while we wait
    booking.status = models.BookingStatus.PENDING_SOUND
    db.add(booking)
    db.commit()
    return {
        "status": "outreach_started",
        "mode": mode,
        "count": len(created),
        "requests": [
            {
                "supplier_service_id": r.supplier_service_id,
                "supplier_public_name": r.supplier_public_name,
                "lock_token": r.lock_token,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "supplier_booking_request_id": r.supplier_booking_request_id,
            }
            for r in created
        ],
    }


@router.get("/bookings/{booking_id}/sound/outreach")
def list_sound_outreach(booking_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Return all outreach requests for the booking with their statuses."""
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if current_user.id not in (booking.artist_id, booking.client_id):
        raise error_response("Forbidden", {"booking_id": "forbidden"}, status.HTTP_403_FORBIDDEN)
    rows = crud.crud_sound.sound_orchestrator.get_all_outreach_for_booking(db, booking_id)
    return [
        {
            "id": r.id,
            "supplier_service_id": r.supplier_service_id,
            "supplier_public_name": r.supplier_public_name,
            "status": r.status.value,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "responded_at": r.responded_at.isoformat() if r.responded_at else None,
        }
        for r in rows
    ]


@router.post("/bookings/{booking_id}/sound/retry")
def retry_outreach(
    booking_id: int,
    *,
    event_city: str | None = None,
    body: SoundRetryIn | None = None,
    db: Session = Depends(get_db),
    current_artist: models.User = Depends(get_current_service_provider),
):
    """Retry outreach to remaining backups if none are active or accepted.

    ``event_city`` may be supplied via query or JSON body. If omitted,
    falls back to the booking.event_city. Returns HTTP 422 if no
    event city can be determined.
    """
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if booking.artist_id != current_artist.id:
        raise error_response("Forbidden", {"booking_id": "forbidden"}, status.HTTP_403_FORBIDDEN)

    rows = crud.crud_sound.sound_orchestrator.get_all_outreach_for_booking(db, booking_id)
    if any(r.status == OutreachStatus.ACCEPTED for r in rows):
        return {"status": "already_accepted"}
    if any(r.status == OutreachStatus.SENT for r in rows):
        return {"status": "already_in_progress"}

    service = db.query(models.Service).filter(models.Service.id == booking.service_id).first()
    if not service:
        raise error_response("Service not found", {"service_id": "not_found"}, status.HTTP_404_NOT_FOUND)

    body_city = body.event_city if body else None
    city = event_city or body_city or booking.event_city or ""
    if not city:
        msg = (
            f"Booking {booking_id} missing event city. Provide ?event_city=<city> "
            "or include event_city in the JSON body."
        )
        raise error_response(
            msg,
            {"event_city": "required"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    preferred = _preferred_suppliers_for_city(service=service, event_city=city)
    if len(preferred) < 3:
        preferred = preferred + _fallback_sound_services(db, artist_id=service.artist_id, event_city=city)[: 3 - len(preferred)]
    already = {r.supplier_service_id for r in rows}
    remaining = [sid for sid in preferred if sid not in already]
    if not remaining:
        return {"status": "no_remaining_candidates"}

    expires_at = datetime.utcnow() + timedelta(hours=24)
    created = []
    for sid in remaining[:3]:
        supplier_service = crud.service.get_service(db, sid)
        if not supplier_service:
            continue
        public_name = None
        if isinstance(supplier_service.details, dict):
            public_name = supplier_service.details.get("publicName")
        if not public_name:
            artist_profile = (
                db.query(models.ServiceProviderProfile)
                .filter(models.ServiceProviderProfile.user_id == supplier_service.artist_id)
                .first()
            )
            public_name = artist_profile.business_name if artist_profile and artist_profile.business_name else supplier_service.title
        row = crud.crud_sound.sound_orchestrator.create_outbound(
            db,
            booking_id=booking.id,
            supplier_service_id=sid,
            expires_at=expires_at,
            supplier_public_name=public_name,
        )
        created.append(row)
    booking.status = models.BookingStatus.PENDING_SOUND
    db.add(booking)
    db.commit()
    return {"status": "restarted", "count": len(created)}


class SupplierRespondIn(BaseModel):
    action: str  # ACCEPT or DECLINE
    price: Optional[float] = None
    lock_token: str


@router.post("/bookings/{booking_id}/service/{service_id}/respond")
def supplier_respond(
    booking_id: int,
    service_id: int,
    body: SupplierRespondIn,
    db: Session = Depends(get_db),
):
    """Supplier accepts with a firm price or declines.

    Secured via a time‑limited lock_token sent to the supplier.
    """
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise error_response(
            "Booking not found",
            {"booking_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    # Find the target outreach row
    row = (
        db.query(models.SoundOutreachRequest)
        .filter(
            models.SoundOutreachRequest.booking_id == booking_id,
            models.SoundOutreachRequest.supplier_service_id == service_id,
        )
        .order_by(models.SoundOutreachRequest.id.desc())
        .first()
    )
    if row is None:
        raise error_response(
            "Outreach not found",
            {"service_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )

    if row.lock_token != body.lock_token:
        raise error_response(
            "Invalid token",
            {"lock_token": "invalid"},
            status.HTTP_403_FORBIDDEN,
        )

    if row.status != OutreachStatus.SENT:
        return {"status": row.status.value}

    # Expire if token timed out
    if row.expires_at and datetime.utcnow() > row.expires_at:
        crud.crud_sound.sound_orchestrator.mark_expired(db, row)
        return {"status": "expired"}

    if body.action.upper() == "DECLINE":
        crud.crud_sound.sound_orchestrator.mark_declined(db, row)
        # Sequential flow will continue when artist calls outreach again; for now we record only
        return {"status": "declined"}

    if body.action.upper() == "ACCEPT":
        if body.price is None or body.price <= 0:
            raise error_response(
                "Price required",
                {"price": "required"},
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        # Accept and firm up
        winner = crud.crud_sound.sound_orchestrator.accept_winner(db, row, body.price)

        # Create a client-facing sound booking request linked to the original
        # artist booking so the client has a dedicated thread and quote/payment
        # flow with the chosen sound supplier (supplier mode only).
        try:
            parent_booking_request_id = None
            # Prefer QuoteV2 linkage to resolve the primary client→artist request.
            try:
                if booking.quote_id:
                    qv2_parent = (
                        db.query(models.QuoteV2)
                        .filter(models.QuoteV2.id == booking.quote_id)
                        .first()
                    )
                    if qv2_parent:
                        parent_booking_request_id = int(qv2_parent.booking_request_id)
            except Exception:
                parent_booking_request_id = None

            parent_br = (
                db.query(models.BookingRequest)
                .filter(models.BookingRequest.id == parent_booking_request_id)
                .first()
                if parent_booking_request_id
                else None
            )
            sound_mode = None
            try:
                tb = parent_br.travel_breakdown or {} if parent_br and isinstance(parent_br.travel_breakdown, dict) else {}
                sound_mode = tb.get("sound_mode")
            except Exception:
                sound_mode = None
            supplier_mode = isinstance(sound_mode, str) and sound_mode.lower() == "supplier"

            supplier_service = (
                db.query(models.Service)
                .filter(models.Service.id == winner.supplier_service_id)
                .first()
            )
            if parent_br and supplier_service and supplier_mode:
                _ensure_client_sound_booking_for_supplier(
                    db,
                    booking=booking,
                    parent_br=parent_br,
                    supplier_service=supplier_service,
                    supplier_public_name=winner.supplier_public_name,
                )
        except Exception:
            # Best-effort only; failure to create the client-facing sound
            # booking must not break supplier acceptance.
            pass

        # Flip booking to confirmed and notify client/artist via system lines
        booking.status = models.BookingStatus.CONFIRMED
        db.add(booking)
        db.commit()

        # Update the original QuoteV2 and sound holds only for non-supplier
        # flows (e.g., managed-by-artist). For supplier mode the sound portion
        # is billed entirely via the separate child booking.
        try:
            if not supplier_mode:
                # Resolve the booking_request_id via legacy quote link or supplier thread
                br_id = None
                if booking.quote_id:
                    legacy_q = db.query(models.Quote).filter(models.Quote.id == booking.quote_id).first()
                    if legacy_q:
                        br_id = legacy_q.booking_request_id
                if br_id is None and row.supplier_booking_request_id:
                    br_id = row.supplier_booking_request_id

                if br_id is not None:
                    # Find the most recent QuoteV2 for this request
                    qv2 = (
                        db.query(models.QuoteV2)
                        .filter(models.QuoteV2.booking_request_id == br_id)
                        .order_by(models.QuoteV2.id.desc())
                        .first()
                    )
                    if qv2 is not None:
                        # Recalculate totals with firm sound
                        sound_amount = float(winner.accepted_amount or 0)
                        # Apply managed-by-artist markup if configured
                        try:
                            br = db.query(models.BookingRequest).filter(models.BookingRequest.id == br_id).first()
                            sound_mode2 = None
                            if br and isinstance(br.travel_breakdown, dict):
                                sound_mode2 = br.travel_breakdown.get("sound_mode")
                            if sound_mode2 == "managed_by_artist":
                                svc = db.query(models.Service).filter(models.Service.id == booking.service_id).first()
                                if svc and getattr(svc, "sound_managed_markup_percent", None):
                                    pct = float(svc.sound_managed_markup_percent or 0)
                                    sound_amount = sound_amount * (1 + pct / 100.0)
                        except Exception:
                            pass
                        qv2.sound_fee = sound_amount
                        qv2.sound_firm = "true"
                        # recompute subtotal/total
                        service_sum = sum((item.get("price", 0) or 0) for item in (qv2.services or []))
                        qv2.subtotal = service_sum + qv2.sound_fee + qv2.travel_fee
                        if qv2.discount:
                            qv2.total = qv2.subtotal - qv2.discount
                        else:
                            qv2.total = qv2.subtotal
                        db.add(qv2)
                        db.commit()

                        # Post timeline updates to the original thread (client-visible)
                        content = (
                            f"Sound confirmed: {winner.supplier_public_name} at price R{sound_amount:.2f}."
                        )
                        msg = models.Message(
                            booking_request_id=br_id,
                            sender_id=booking.artist_id,
                            sender_type=models.SenderType.ARTIST,
                            content=content,
                            message_type=models.MessageType.SYSTEM,
                        )
                        db.add(msg)
                        db.commit()
                # Capture sound hold if authorized; reconcile full-charge totals (refund/top-up)
                bs = (
                    db.query(models.BookingSimple)
                    .filter(models.BookingSimple.quote_id == booking.quote_id)
                    .first()
                )
                if bs and bs.sound_hold_status == "authorized":
                    bs.sound_hold_status = "captured"
                    db.add(bs)
                    db.commit()
                if bs and bs.payment_status == "paid" and bs.charged_total_amount is not None:
                    qv2_new = db.query(models.QuoteV2).filter(models.QuoteV2.id == bs.quote_id).first()
                    if qv2_new:
                        new_total = float(qv2_new.total or 0)
                        charged = float(bs.charged_total_amount or 0)
                        delta = round(new_total - charged, 2)
                        if abs(delta) >= 0.01:
                            if delta < 0:
                                refund_id = f"refund_{uuid.uuid4().hex}"
                                try:
                                    path = os.path.join(os.path.dirname(__file__), "..", "static", "receipts", f"{refund_id}.pdf")
                                    path = os.path.abspath(path)
                                    os.makedirs(os.path.dirname(path), exist_ok=True)
                                    with open(path, "wb") as f:
                                        f.write(b"%PDF-1.4 refund\n%%EOF")
                                except Exception:
                                    pass
                                bs.charged_total_amount = qv2_new.total
                                db.add(bs)
                                db.commit()
                                try:
                                    br_id2 = qv2_new.booking_request_id
                                    msg2 = models.Message(
                                        booking_request_id=br_id2,
                                        sender_id=booking.artist_id,
                                        sender_type=models.SenderType.ARTIST,
                                        content=f"Sound finalized below estimate. Refund issued: R{abs(delta):.2f}.",
                                        message_type=models.MessageType.SYSTEM,
                                    )
                                    db.add(msg2)
                                    db.commit()
                                except Exception:
                                    pass
                            else:
                                topup_id = f"topup_{uuid.uuid4().hex}"
                                try:
                                    path = os.path.join(os.path.dirname(__file__), "..", "static", "receipts", f"{topup_id}.pdf")
                                    path = os.path.abspath(path)
                                    os.makedirs(os.path.dirname(path), exist_ok=True)
                                    with open(path, "wb") as f:
                                        f.write(b"%PDF-1.4 topup\n%%EOF")
                                except Exception:
                                    pass
                                bs.charged_total_amount = qv2_new.total
                                db.add(bs)
                                db.commit()
                                try:
                                    br_id2 = qv2_new.booking_request_id
                                    msg2 = models.Message(
                                        booking_request_id=br_id2,
                                        sender_id=booking.artist_id,
                                        sender_type=models.SenderType.ARTIST,
                                        content=f"Sound finalized above estimate. Additional charge R{delta:.2f} captured.",
                                        message_type=models.MessageType.SYSTEM,
                                    )
                                    db.add(msg2)
                                    db.commit()
                                except Exception:
                                    pass
        except Exception:
            pass

        return {"status": "accepted", "firm_price": float(winner.accepted_amount or 0)}

    raise error_response(
        "Invalid action",
        {"action": "invalid"},
        status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


class ToggleSoundIn(BaseModel):
    requires_sound: bool
    event_city: Optional[str] = None
    selected_service_id: Optional[int] = None
    sound_mode: Optional[str] = None  # supplier|provided_by_artist|client_provided|managed_by_artist


@router.post("/bookings/{booking_id}/toggle-sound")
def toggle_sound(
    booking_id: int,
    body: ToggleSoundIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Flip requires_sound and (re)start outreach when turning on.

    - Allowed by the client or the artist involved in the booking.
    - If turning off: expire active outreach and set status to CONFIRMED if previously pending sound.
    - If turning on: set status to PENDING_SOUND and call outreach using the booking's artist.
    """
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)

    if current_user.id not in (booking.client_id, booking.artist_id):
        raise error_response("Forbidden", {"booking_id": "forbidden"}, status.HTTP_403_FORBIDDEN)

    if not body.requires_sound:
        # Expire any active outreach
        rows = crud.crud_sound.sound_orchestrator.get_active_outreach_for_booking(db, booking_id)
        for r in rows:
            crud.crud_sound.sound_orchestrator.mark_expired(db, r)
        if booking.status == models.BookingStatus.PENDING_SOUND:
            booking.status = models.BookingStatus.CONFIRMED
            db.add(booking)
            db.commit()
        return {"status": "sound_disabled"}

    # Turning on: handle special modes (client_provided/provided_by_artist)
    if body.sound_mode in {"client_provided", "provided_by_artist"}:
        # Confirm booking and handle holds appropriately; no outreach
        booking.status = models.BookingStatus.CONFIRMED
        db.add(booking)
        db.commit()
        bs = (
            db.query(models.BookingSimple)
            .filter(models.BookingSimple.quote_id == booking.quote_id)
            .first()
        )
        if bs:
            if body.sound_mode == "client_provided" and bs.sound_hold_status == "authorized":
                bs.sound_hold_status = "released"
            elif body.sound_mode == "provided_by_artist" and bs.sound_hold_status == "authorized":
                bs.sound_hold_status = "captured"
            db.add(bs)
            db.commit()
        return {"status": body.sound_mode}

    # Turning on supplier/managed_by_artist: must know event city
    city = body.event_city or booking.event_city or ""
    if not city:
        raise error_response(
            "event_city required to start outreach",
            {"event_city": "required"},
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    # Start outreach as the artist
    artist = db.query(models.User).filter(models.User.id == booking.artist_id).first()
    if not artist:
        raise error_response("Artist not found", {"artist_id": "not_found"}, status.HTTP_404_NOT_FOUND)

    # Use sequential default
    res = kickoff_sound_outreach(
        booking_id,
        event_city=city,
        request_timeout_hours=24,
        mode="sequential",
        selected_service_id=body.selected_service_id,
        db=db,
        current_artist=artist,
    )
    return res
