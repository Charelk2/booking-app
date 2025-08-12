from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .dependencies import get_current_service_provider, get_current_user
from ..crud import crud_sound, crud_service, crud_booking_request, crud_message
from ..models.sound_outreach import OutreachStatus
from ..models.service import Service, ServiceType
from ..utils import error_response
from ..utils.notifications import (
    notify_service_request,
    notify_service_nudge,
)

router = APIRouter(tags=["sound-outreach"])


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
    preferred = _preferred_suppliers_for_city(service=service, event_city=event_city)
    if len(preferred) < 3:
        preferred = preferred + _fallback_sound_services(db, artist_id=service.artist_id, event_city=event_city)[: 3 - len(preferred)]

    if selected_service_id and selected_service_id in preferred:
        # If explicitly selected, contact only that supplier first
        preferred = [selected_service_id]

    if not preferred:
        # Nothing to contact; fail fast
        booking.status = models.BookingStatus.FAILED_NO_SOUND
        db.add(booking)
        db.commit()
        return {"status": "no_candidates"}

    # Don’t duplicate if active request exists
    active = crud_sound.sound_orchestrator.get_active_outreach_for_booking(db, booking.id)
    if active:
        return {"status": "already_in_progress"}

    expires_at = None
    if request_timeout_hours and request_timeout_hours > 0:
        expires_at = datetime.utcnow() + timedelta(hours=request_timeout_hours)

    # Create rows
    created: List[models.sound_outreach.SoundOutreachRequest] = []  # type: ignore[attr-defined]
    for sid in preferred[:3]:
        supplier_service = crud_service.service.get_service(db, sid)
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

        row = crud_sound.sound_orchestrator.create_outbound(
            db,
            booking_id=booking.id,
            supplier_service_id=sid,
            expires_at=expires_at,
            supplier_public_name=public_name,
        )
        # Create a supplier-facing booking request thread so they can ask questions and send a quote
        try:
            supplier_request = crud_booking_request.create_booking_request(
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
            crud_message.create_message(
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

        # Notify supplier with secure respond URL
        try:
            lock_url = f"/supplier/respond?booking_id={booking.id}&service_id={sid}&token={row.lock_token}"
            notify_service_request(supplier_service, booking, expires_at, lock_url)  # type: ignore[arg-type]
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
    rows = crud_sound.sound_orchestrator.get_all_outreach_for_booking(db, booking_id)
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
    falls back to the booking.event_city.
    """
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise error_response("Booking not found", {"booking_id": "not_found"}, status.HTTP_404_NOT_FOUND)
    if booking.artist_id != current_artist.id:
        raise error_response("Forbidden", {"booking_id": "forbidden"}, status.HTTP_403_FORBIDDEN)

    rows = crud_sound.sound_orchestrator.get_all_outreach_for_booking(db, booking_id)
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
        raise error_response("Missing event city", {"event_city": "required"}, status.HTTP_422_UNPROCESSABLE_ENTITY)

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
        supplier_service = crud_service.service.get_service(db, sid)
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
        row = crud_sound.sound_orchestrator.create_outbound(
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


from pydantic import BaseModel


class SoundRetryIn(BaseModel):
    """Payload for retrying sound outreach."""

    event_city: str | None = None


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
        crud_sound.sound_orchestrator.mark_expired(db, row)
        return {"status": "expired"}

    if body.action.upper() == "DECLINE":
        crud_sound.sound_orchestrator.mark_declined(db, row)
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
        winner = crud_sound.sound_orchestrator.accept_winner(db, row, body.price)

        # Flip booking to confirmed and notify deposit flow owner
        booking.status = models.BookingStatus.CONFIRMED
        db.add(booking)
        db.commit()

        # Write a system message to the original chat timeline (if any)
        try:
            # Find a booking_request via quote if present
            if booking.quote_id:
                q = db.query(models.Quote).filter(models.Quote.id == booking.quote_id).first()
                if q and q.booking_request_id:
                    content = f"Sound confirmed: {winner.supplier_public_name} at price R{float(winner.accepted_amount):.2f}."
                    db_msg = models.Message(
                        booking_request_id=q.booking_request_id,
                        sender_id=booking.artist_id,
                        sender_type=models.SenderType.ARTIST,
                        content=content,
                        message_type=models.MessageType.SYSTEM,
                    )
                    db.add(db_msg)
                    db.commit()
            # Create a final client-facing sound-only quote for records/payment later
            try:
                # Resolve booking_request_id for QuoteV2 linkage
                br_id = None
                if booking.quote_id:
                    legacy_q = db.query(models.Quote).filter(models.Quote.id == booking.quote_id).first()
                    if legacy_q:
                        br_id = legacy_q.booking_request_id
                if br_id is None and row.supplier_booking_request_id:
                    br_id = row.supplier_booking_request_id
                if br_id is not None:
                    from ..schemas import QuoteV2Create  # type: ignore
                    from ..crud import crud_quote_v2
                    quote_in = QuoteV2Create(
                        booking_request_id=br_id,
                        artist_id=booking.artist_id,
                        client_id=booking.client_id,
                        services=[],
                        sound_fee=float(winner.accepted_amount or 0),
                        travel_fee=0,
                        accommodation=None,
                        discount=None,
                        expires_at=None,
                    )
                    v2 = crud_quote_v2.create_quote(db, quote_in)
                    # Notify through the original thread, if available
                    if booking.quote_id:
                        legacy_q = db.query(models.Quote).filter(models.Quote.id == booking.quote_id).first()
                        if legacy_q and legacy_q.booking_request_id:
                            content2 = (
                                f"Sound fee finalized at R{float(winner.accepted_amount):.2f}. "
                                f"Quote available at /quotes/{v2.id}. Payment to follow."
                            )
                            msg = models.Message(
                                booking_request_id=legacy_q.booking_request_id,
                                sender_id=booking.artist_id,
                                sender_type=models.SenderType.ARTIST,
                                content=content2,
                                message_type=models.MessageType.SYSTEM,
                            )
                            db.add(msg)
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
