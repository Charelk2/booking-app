from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, time
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from .. import models


def _parse_time(val: Optional[str]) -> Optional[time]:
    if not val:
        return None
    try:
        parts = [int(p) for p in str(val).split(":")[:3]]
        while len(parts) < 3:
            parts.append(0)
        return time(parts[0], parts[1], parts[2])
    except Exception:
        return None


def get_by_booking_id(db: Session, booking_id: int) -> Optional[models.EventPrep]:
    return (
        db.query(models.EventPrep)
        .filter(models.EventPrep.booking_id == booking_id)
        .first()
    )


def _resolve_booking_request_id(db: Session, booking_id: int) -> Optional[int]:
    # Primary: Booking.quote_id → QuoteV2
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        return None
    if booking.quote_id is not None:
        qv2 = (
            db.query(models.QuoteV2)
            .filter(models.QuoteV2.id == booking.quote_id)
            .first()
        )
        if qv2:
            return qv2.booking_request_id
    # Fallback via BookingSimple
    bs = (
        db.query(models.BookingSimple)
        .filter(models.BookingSimple.artist_id == booking.artist_id)
        .filter(models.BookingSimple.client_id == booking.client_id)
        .first()
    )
    if bs:
        qv2 = (
            db.query(models.QuoteV2)
            .filter(models.QuoteV2.id == bs.quote_id)
            .first()
        )
        if qv2:
            return qv2.booking_request_id
    return None


def compute_progress(db: Session, booking_id: int, ep: models.EventPrep) -> Tuple[int, int]:
    done = 0
    total = 6
    # 1) Day-of contact
    if (ep.day_of_contact_name or "").strip() and (ep.day_of_contact_phone or "").strip():
        done += 1
    # 2) Venue address
    if (ep.venue_address or "").strip():
        done += 1
    # 3) Load-in window
    if ep.loadin_start and ep.loadin_end:
        done += 1
    # 4) Tech owner — always set; default counts as done
    if (ep.tech_owner or "venue") in {"venue", "artist"}:
        done += 1
    # 5) Stage power
    if bool(ep.stage_power_confirmed):
        done += 1
    # 6) Payment acknowledged (full-upfront)
    paid = False
    # Derive from BookingSimple if linked via QuoteV2
    br_id = _resolve_booking_request_id(db, booking_id)
    if br_id is not None:
        bs = (
            db.query(models.BookingSimple)
            .join(models.QuoteV2, models.BookingSimple.quote_id == models.QuoteV2.id)
            .filter(models.QuoteV2.booking_request_id == br_id)
            .first()
        )
        if bs and ((bs.payment_status or "").lower() == "paid" or (bs.charged_total_amount or 0) > 0):
            paid = True
    # Also treat confirmed/completed bookings as acknowledged
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if booking and str(getattr(booking, "status", "")).lower() in {"confirmed", "completed"}:
        paid = True
    if paid:
        done += 1
    return done, total


def upsert(
    db: Session,
    booking_id: int,
    patch: Dict[str, Any],
    updated_by_user_id: Optional[int] = None,
) -> models.EventPrep:
    ep = get_by_booking_id(db, booking_id)
    creating = False
    if ep is None:
        ep = models.EventPrep(booking_id=booking_id)
        creating = True

    # Only map known fields; coerce times
    for key in [
        "day_of_contact_name",
        "day_of_contact_phone",
        "venue_address",
        "venue_place_id",
        "venue_lat",
        "venue_lng",
        "tech_owner",
        # "stage_power_confirmed" removed from UI but keep write for compatibility
        "stage_power_confirmed",
        "accommodation_required",
        "accommodation_address",
        "accommodation_contact",
        "accommodation_notes",
        "notes",
        "schedule_notes",
        "parking_access_notes",
        "event_type",
        "guests_count",
    ]:
        if key in patch:
            setattr(ep, key, patch[key])
    if "loadin_start" in patch:
        ep.loadin_start = _parse_time(patch.get("loadin_start"))
    if "loadin_end" in patch:
        ep.loadin_end = _parse_time(patch.get("loadin_end"))
    if "soundcheck_time" in patch:
        ep.soundcheck_time = _parse_time(patch.get("soundcheck_time"))
    if "guests_arrival_time" in patch:
        ep.guests_arrival_time = _parse_time(patch.get("guests_arrival_time"))
    if "performance_start_time" in patch:
        ep.performance_start_time = _parse_time(patch.get("performance_start_time"))
    if "performance_end_time" in patch:
        ep.performance_end_time = _parse_time(patch.get("performance_end_time"))

    if updated_by_user_id:
        ep.updated_by_user_id = updated_by_user_id

    db.add(ep)
    db.commit()
    db.refresh(ep)

    done, total = compute_progress(db, booking_id, ep)
    if ep.progress_cached != done:
        ep.progress_cached = done
        db.add(ep)
        db.commit()
        db.refresh(ep)

    return ep


def seed_for_booking(db: Session, booking: models.Booking) -> models.EventPrep:
    ep = get_by_booking_id(db, booking.id)
    if ep:
        return ep

    # Try to derive from booking request travel_breakdown
    venue_address: Optional[str] = None
    tech_owner = "venue"
    accommodation_required = False

    br_id = _resolve_booking_request_id(db, booking.id)
    tb: Dict[str, Any] | None = None
    if br_id is not None:
        br = (
            db.query(models.BookingRequest)
            .filter(models.BookingRequest.id == br_id)
            .first()
        )
        if br:
            tb = br.travel_breakdown if isinstance(br.travel_breakdown, dict) else None

    if tb:
        # Prefer precise address from travel breakdown; fallback to city/town
        venue_address = (
            tb.get("address")
            or tb.get("venue_address")
            or tb.get("event_address")
            or tb.get("city")
            or tb.get("town")
            or tb.get("event_city")
        )
        accommodation_required = bool(tb.get("accommodation_required"))

        # Determine tech owner when sound is provided by the artist
        sound_required = bool(tb.get("sound_required"))
        sound_mode = (tb.get("sound_mode") or "").lower()
        if sound_required and sound_mode in {
            "provided_by_artist",
            "artist_provides_variable",
            "artist_provides_fixed",
            "managed_by_artist",
        }:
            tech_owner = "artist"

    # If not resolved via travel breakdown, peek at service details
    try:
        service = (
            db.query(models.Service)
            .filter(models.Service.id == booking.service_id)
            .first()
        )
        if service and isinstance(service.details, dict):
            sm = (service.details.get("sound_mode") or "").lower()
            if sm in {"provided_by_artist", "artist_provides_variable", "artist_provides_fixed", "managed_by_artist"}:
                tech_owner = "artist"
    except Exception:
        pass

    # If booking originated from QuoteV2 and the quote includes sound, prefer artist
    try:
        if getattr(booking, "quote_id", None):
            qv2 = db.query(models.QuoteV2).filter(models.QuoteV2.id == booking.quote_id).first()
            if qv2 and (float(qv2.sound_fee or 0) > 0 or (qv2.sound_firm or "").lower() == "true"):
                tech_owner = "artist"
    except Exception:
        pass

    ep = models.EventPrep(
        booking_id=booking.id,
        venue_address=venue_address,
        tech_owner=tech_owner or "venue",
        accommodation_required=bool(accommodation_required),
        progress_cached=0,
    )
    db.add(ep)
    db.commit()
    db.refresh(ep)

    done, total = compute_progress(db, booking.id, ep)
    if ep.progress_cached != done:
        ep.progress_cached = done
        db.add(ep)
        db.commit()
        db.refresh(ep)

    return ep


def idempotency_check(
    db: Session, booking_id: int, key: Optional[str], request_hash: Optional[str]
) -> Tuple[bool, Optional[models.EventPrep]]:
    """Return (is_duplicate, current_ep) for idempotent writes.

    If a record exists for (booking_id, key_hash) created within 24h, treat as
    duplicate and return the current EventPrep row. Otherwise, record it now.
    """
    if not key:
        return False, None
    key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
    existing = (
        db.query(models.EventPrepIdempotency)
        .filter(models.EventPrepIdempotency.booking_id == booking_id)
        .filter(models.EventPrepIdempotency.key_hash == key_hash)
        .first()
    )
    if existing and (datetime.utcnow() - existing.created_at) <= timedelta(hours=24):
        return True, get_by_booking_id(db, booking_id)
    # Record it now
    idem = models.EventPrepIdempotency(
        booking_id=booking_id,
        key_hash=key_hash,
        request_hash=(
            hashlib.sha256(request_hash.encode("utf-8")).hexdigest()
            if request_hash
            else None
        ),
    )
    db.add(idem)
    db.commit()
    return False, None
