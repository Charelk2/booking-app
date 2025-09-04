from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from .. import models
from ..crud import crud_message
from ..utils.notifications import (
    notify_deposit_due,
    notify_user_new_message,
    notify_service_nudge,
)
from ..api.api_sound_outreach import _preferred_suppliers_for_city, _fallback_sound_services
from ..crud import crud_sound, crud_service


def _resolve_booking_request_id(db: Session, booking: models.Booking) -> Optional[int]:
    """Best-effort resolution of the original booking_request_id for a booking.

    Uses QuoteV2 linkage when available.
    """
    if booking.quote_id is None:
        return None
    qv2 = db.query(models.QuoteV2).filter(models.QuoteV2.id == booking.quote_id).first()
    return qv2.booking_request_id if qv2 else None


def _post_system(
    db: Session,
    br_id: int,
    actor_id: int,
    content: str,
    visible_to: models.VisibleTo = models.VisibleTo.BOTH,
    system_key: str | None = None,
) -> None:
    """Create a system message and ping the opposite party.

    Optionally sets a system_key so downstream previews/renderers can reliably
    detect reminder types without relying on string matching.
    """
    msg = crud_message.create_message(
        db=db,
        booking_request_id=br_id,
        sender_id=actor_id,
        sender_type=models.SenderType.ARTIST,
        content=content,
        message_type=models.MessageType.SYSTEM,
        visible_to=visible_to,
        system_key=system_key,
    )
    # Notify both sides best-effort
    br = db.query(models.BookingRequest).filter(models.BookingRequest.id == br_id).first()
    if not br:
        return
    artist = db.query(models.User).filter(models.User.id == br.artist_id).first()
    client = db.query(models.User).filter(models.User.id == br.client_id).first()
    try:
        if artist and client:
            notify_user_new_message(db, client, artist, br_id, content, models.MessageType.SYSTEM)
            notify_user_new_message(db, artist, artist, br_id, content, models.MessageType.SYSTEM)
    except Exception:
        pass


def handle_deposit_due_reminders(db: Session) -> int:
    """No-op: deposits removed; all clients pay full upfront.

    Kept for backward compatibility with the maintenance loop.
    """
    return 0


def handle_sound_outreach_nudges_and_expiry(db: Session) -> dict:
    """Nudge near-expiring sound requests and expire overdue ones.

    If a booking has no active or accepted requests after expiry, attempt to
    contact remaining backups.
    """
    now = datetime.utcnow()
    results = {"nudged": 0, "expired": 0, "restarted": 0}

    # 1) Nudges: expiring within 4 hours
    expiring = (
        db.query(models.SoundOutreachRequest)
        .filter(
            models.SoundOutreachRequest.status == models.OutreachStatus.SENT,
            models.SoundOutreachRequest.expires_at != None,
            models.SoundOutreachRequest.expires_at > now,
            models.SoundOutreachRequest.expires_at <= now + timedelta(hours=4),
        )
        .all()
    )
    for r in expiring:
        booking = db.query(models.Booking).filter(models.Booking.id == r.booking_id).first()
        service = db.query(models.Service).filter(models.Service.id == r.supplier_service_id).first()
        if booking and service:
            try:
                notify_service_nudge(service, booking)
                results["nudged"] += 1
            except Exception:
                pass

    # 2) Expire overdue
    overdue = (
        db.query(models.SoundOutreachRequest)
        .filter(
            models.SoundOutreachRequest.status == models.OutreachStatus.SENT,
            models.SoundOutreachRequest.expires_at != None,
            models.SoundOutreachRequest.expires_at <= now,
        )
        .all()
    )
    bookings_to_consider: set[int] = set()
    for r in overdue:
        crud_sound.sound_orchestrator.mark_expired(db, r)
        results["expired"] += 1
        bookings_to_consider.add(r.booking_id)

    # 3) For bookings with no active/accepted, try remaining backups
    for bid in bookings_to_consider:
        rows = crud_sound.sound_orchestrator.get_all_outreach_for_booking(db, bid)
        if any(rr.status == models.OutreachStatus.ACCEPTED for rr in rows):
            continue
        if any(rr.status == models.OutreachStatus.SENT for rr in rows):
            continue

        booking = db.query(models.Booking).filter(models.Booking.id == bid).first()
        if not booking:
            continue
        service = db.query(models.Service).filter(models.Service.id == booking.service_id).first()
        if not service:
            continue
        # Determine event city
        city = booking.event_city or ""
        if not city:
            # try booking_request travel_breakdown
            br_id = _resolve_booking_request_id(db, booking)
            if br_id:
                br = db.query(models.BookingRequest).filter(models.BookingRequest.id == br_id).first()
                tb = br.travel_breakdown or {}
                if isinstance(tb, dict):
                    city = tb.get("event_city") or ""
        if not city:
            # Cannot retry without coverage target
            continue

        preferred = _preferred_suppliers_for_city(service=service, event_city=city)
        if len(preferred) < 3:
            preferred = preferred + _fallback_sound_services(db, artist_id=service.artist_id, event_city=city)[: 3 - len(preferred)]
        already = {r.supplier_service_id for r in rows}
        remaining = [sid for sid in preferred if sid not in already]
        if not remaining:
            # Release sound hold; surface failure to the artist and client
            try:
                bsimple = (
                    db.query(models.BookingSimple)
                    .join(models.Booking, models.BookingSimple.quote_id == models.Booking.quote_id)
                    .filter(models.Booking.id == bid)
                    .first()
                )
                if bsimple and bsimple.sound_hold_status == "authorized":
                    bsimple.sound_hold_status = "released"
                    db.add(bsimple)
                    db.commit()
            except Exception:
                pass
            br_id = _resolve_booking_request_id(db, booking)
            if br_id:
                _post_system(
                    db,
                    br_id,
                    actor_id=booking.artist_id,
                    content=(
                        "All sound options declined — choose another supplier or we’ll refund the sound hold."
                    ),
                    visible_to=models.VisibleTo.CLIENT,
                )
            continue

        expires_at = datetime.utcnow() + timedelta(hours=24)
        created = 0
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
            crud_sound.sound_orchestrator.create_outbound(
                db,
                booking_id=booking.id,
                supplier_service_id=sid,
                expires_at=expires_at,
                supplier_public_name=public_name,
            )
            created += 1
        if created:
            booking.status = models.BookingStatus.PENDING_SOUND
            db.add(booking)
            db.commit()
            results["restarted"] += 1

            # Inform artist timeline
            br_id = _resolve_booking_request_id(db, booking)
            if br_id:
                _post_system(
                    db,
                    br_id,
                    actor_id=booking.artist_id,
                    content=(
                        f"Sound outreach restarted to {created} additional provider(s). "
                        "We’ll notify you when a supplier accepts or the request expires."
                    ),
                    visible_to=models.VisibleTo.ARTIST,
                )
    return results


def handle_pre_event_reminders(db: Session) -> int:
    """Send 72h and 24h pre-event reminders with system messages to both parties."""
    now = datetime.utcnow()
    soon_72 = now + timedelta(hours=72)
    soon_24 = now + timedelta(hours=24)

    bookings = (
        db.query(models.Booking)
        .filter(models.Booking.status == models.BookingStatus.CONFIRMED)
        .all()
    )
    sent = 0
    for b in bookings:
        if b.start_time is None:
            continue

        when = None
        label = None
        if now < b.start_time <= soon_24:
            when = "24h"
            label = "Event is tomorrow"
        elif now < b.start_time <= soon_72:
            when = "72h"
            label = "Event in 3 days"
        else:
            continue

        br_id = _resolve_booking_request_id(db, b)
        if not br_id:
            continue

        # Compose concise, actionable reminders
        date_str = b.start_time.strftime("%Y-%m-%d %H:%M")
        ics_link = f"/api/v1/bookings/{b.id}/calendar.ics"

        # If sound is still pending, inform artist specifically
        sound_pending = b.status == models.BookingStatus.PENDING_SOUND

        client = db.query(models.User).filter(models.User.id == b.client_id).first()
        artist = db.query(models.User).filter(models.User.id == b.artist_id).first()
        if not client or not artist:
            continue

        # Client-facing message
        content_client = (
            f"{label}: {date_str}. Add to calendar: {ics_link}. "
            "Please share any access/parking details and confirm guest count."
        )
        _post_system(db, br_id, actor_id=artist.id, content=content_client, visible_to=models.VisibleTo.CLIENT, system_key="event_reminder")

        # Artist-facing message
        content_artist = (
            f"{label}: {date_str}. Tech check and arrival time confirmed? "
            "If sound is required, ensure supplier status is up to date in this thread."
        )
        _post_system(db, br_id, actor_id=artist.id, content=content_artist, visible_to=models.VisibleTo.ARTIST, system_key="event_reminder")

        sent += 2
    return sent


def run_maintenance(db: Session) -> dict:
    """Run all operational maintenance tasks once and return a summary."""
    deposit = handle_deposit_due_reminders(db)
    so = handle_sound_outreach_nudges_and_expiry(db)
    pre = handle_pre_event_reminders(db)
    artist_timeouts = handle_artist_accept_timeouts(db)
    return {"deposit_reminders": deposit, **so, "pre_event_messages": pre, **artist_timeouts}


def handle_artist_accept_timeouts(db: Session) -> dict:
    """Cancel bookings that exceeded artist acceptance SLA and release holds."""
    now = datetime.utcnow()
    rows = (
        db.query(models.Booking)
        .filter(
            models.Booking.status == models.BookingStatus.PENDING_ARTIST_CONFIRMATION,
            models.Booking.artist_accept_deadline_at != None,
            models.Booking.artist_accept_deadline_at <= now,
        )
        .all()
    )
    cancelled = 0
    released_artist = 0
    released_sound = 0
    for b in rows:
        bs = (
            db.query(models.BookingSimple)
            .filter(models.BookingSimple.quote_id == b.quote_id)
            .first()
        )
        if bs:
            if bs.artist_hold_status == "authorized":
                bs.artist_hold_status = "released"
                released_artist += 1
            if bs.sound_hold_status == "authorized":
                bs.sound_hold_status = "released"
                released_sound += 1
            db.add(bs)
        b.status = models.BookingStatus.CANCELLED
        db.add(b)
        db.commit()
        cancelled += 1

        # Post timeline updates
        br_id = _resolve_booking_request_id(db, b)
        if br_id:
            _post_system(
                db,
                br_id,
                actor_id=b.artist_id,
                content=(
                    "Artist did not accept in time. Holds released; please choose another artist."
                ),
                visible_to=models.VisibleTo.CLIENT,
            )
    return {"artist_timeouts": cancelled, "artist_holds_released": released_artist, "sound_holds_released": released_sound}
