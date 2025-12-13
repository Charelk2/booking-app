from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database import SessionLocal

from .. import models
from ..core.config import settings
from ..crud import crud_message
from ..utils.notifications import (
    notify_user_new_message,
    notify_service_nudge,
)
from ..api.api_sound_outreach import _preferred_suppliers_for_city, _fallback_sound_services
from ..crud import crud_sound, crud_service
from sqlalchemy import and_


def _resolve_booking_request_id(db: Session, booking: models.Booking) -> Optional[int]:
    """Best-effort resolution of the original booking_request_id for a booking.

    Uses QuoteV2 linkage when available.
    """
    if booking.quote_id is None:
        return None
    qv2 = db.query(models.QuoteV2).filter(models.QuoteV2.id == booking.quote_id).first()
    return qv2.booking_request_id if qv2 else None


def _has_open_dispute(db: Session, booking_id: int) -> bool:
    """Return True if there is an open/active dispute row for this booking."""
    try:
        # Use raw SQL to match the lightweight disputes table created in db_utils.
        row = db.execute(
            text(
                "SELECT 1 FROM disputes WHERE booking_id=:bid AND status IN ('open', 'needs_info') LIMIT 1"
            ),
            {"bid": int(booking_id)},
        ).fetchone()
        return row is not None
    except Exception:
        return False


def _has_open_simple_dispute(db: Session, booking_simple_id: int) -> bool:
    """Return True if there is an open/active dispute row for this BookingSimple."""
    try:
        row = db.execute(
            text(
                "SELECT 1 FROM disputes WHERE booking_simple_id=:sid AND status IN ('open', 'needs_info') LIMIT 1"
            ),
            {"sid": int(booking_simple_id)},
        ).fetchone()
        return row is not None
    except Exception:
        return False


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


# Deposits removed: no deposit reminders


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
    """Send 7-day and 3-day pre-event reminders with system messages to both parties."""
    now = datetime.utcnow()
    today = now.date()

    bookings = (
        db.query(models.Booking)
        .filter(models.Booking.status == models.BookingStatus.CONFIRMED)
        .all()
    )
    sent = 0
    for b in bookings:
        if b.start_time is None:
            continue

        days_until = (b.start_time.date() - today).days
        label: str | None = None
        horizon: str | None = None

        # 30 days out: early heads-up so both sides can still change plans.
        if days_until == 30:
            horizon = "30d"
            label = "Event in 30 days"
        # 7 days: existing weekly reminder.
        elif days_until == 7:
            horizon = "7d"
            label = "Event in 7 days"
        # 3 days: existing last‑few‑days reminder.
        elif days_until == 3:
            horizon = "3d"
            label = "Event in 3 days"
        # 0 days: same‑day reminder rendered as “Event is today: …”.
        elif days_until == 0:
            horizon = "0d"
            label = "Event today"
        else:
            continue

        if not label or not horizon:
            continue

        br_id = _resolve_booking_request_id(db, b)
        if not br_id:
            continue

        system_key = f"event_reminder:{horizon}"

        # Dedupe: only send each horizon reminder once per thread
        existing = (
            db.query(models.Message)
            .filter(
                models.Message.booking_request_id == br_id,
                models.Message.message_type == models.MessageType.SYSTEM,
                models.Message.system_key == system_key,
            )
            .first()
        )
        if existing:
            continue

        date_str = b.start_time.strftime("%Y-%m-%d")

        client = db.query(models.User).filter(models.User.id == b.client_id).first()
        artist = db.query(models.User).filter(models.User.id == b.artist_id).first()
        if not client or not artist:
            continue

        if horizon == "30d":
            client_content = (
                f"{label}: {date_str}. "
                "Your event is in 30 days. Take a moment to double-check the date, "
                "location and guest count, and share any important details in this chat."
            )
            artist_content = (
                f"{label}: {date_str}. "
                "You have an event in 30 days. Block your calendar, review travel and "
                "equipment needs, and message the client if anything major changes."
            )
        elif horizon == "7d":
            client_content = (
                f"{label}: {date_str}. "
                "Your event is in 7 days. Please review your booking details "
                "(time, address, guest count and any special requests) and use "
                "this chat if anything needs to change."
            )
            artist_content = (
                f"{label}: {date_str}. "
                "You have an event in 7 days. Please review the booking details, "
                "confirm your schedule, travel and equipment, and message the "
                "client if you need any clarification."
            )
        elif horizon == "3d":
            client_content = (
                f"{label}: {date_str}. "
                "Your event is in 3 days. Please reconfirm the time and address, "
                "plan your arrival, and share any last-minute updates in this chat."
            )
            artist_content = (
                f"{label}: {date_str}. "
                "Your event is in 3 days. Please confirm the time and address, "
                "check technical and setup requirements, and share your arrival "
                "plan with the client."
            )
        else:  # "0d" (today)
            client_content = (
                f"Event is today: {date_str}. "
                "Your event is today. Please be ready at the agreed time and keep your "
                "phone nearby in case your provider needs to reach you."
            )
            artist_content = (
                f"Event is today: {date_str}. "
                "Your event is today. Leave enough time for travel and setup, and send a quick "
                "message here once you are on your way or on site."
            )

        _post_system(
            db,
            br_id,
            actor_id=artist.id,
            content=client_content,
            visible_to=models.VisibleTo.CLIENT,
            system_key=system_key,
        )

        _post_system(
            db,
            br_id,
            actor_id=artist.id,
            content=artist_content,
            visible_to=models.VisibleTo.ARTIST,
            system_key=system_key,
        )

        sent += 2
    return sent


def handle_post_event_prompts(db: Session) -> dict:
    """Send post-event prompts shortly after end_time to both parties."""
    now = datetime.utcnow()
    results = {"post_event_prompts_created": 0}

    bookings = (
        db.query(models.Booking)
        .filter(
            models.Booking.status == models.BookingStatus.CONFIRMED,
            models.Booking.end_time != None,  # noqa: E711
        )
        .all()
    )
    for b in bookings:
        if not b.end_time:
            continue
        # Only consider events that have ended but are still within the
        # complaint window horizon; auto-completion covers the later phase.
        if not (now >= b.end_time and now < b.end_time + timedelta(hours=12)):
            continue

        br_id = _resolve_booking_request_id(db, b)
        if not br_id:
            continue

        # Dedupe: only send once per thread per role.
        existing = (
            db.query(models.Message)
            .filter(
                models.Message.booking_request_id == br_id,
                models.Message.message_type == models.MessageType.SYSTEM,
                models.Message.system_key.in_(
                    ["event_finished_v1:client", "event_finished_v1:artist"]
                ),
            )
            .first()
        )
        if existing:
            continue

        date_str = b.end_time.strftime("%Y-%m-%d")

        client = db.query(models.User).filter(models.User.id == b.client_id).first()
        artist = db.query(models.User).filter(models.User.id == b.artist_id).first()
        if not client or not artist:
            continue

        client_content = (
            f"Event finished: {date_str}. "
            "Your event has finished. If anything was not as expected, you can "
            "report a problem from this chat within 12 hours."
        )
        artist_content = (
            f"Event finished: {date_str}. "
            "Your event has finished. Review the event and mark this booking as "
            "completed, or report a problem if something went wrong."
        )

        _post_system(
            db,
            br_id,
            actor_id=artist.id,
            content=client_content,
            visible_to=models.VisibleTo.CLIENT,
            system_key="event_finished_v1:client",
        )
        _post_system(
            db,
            br_id,
            actor_id=artist.id,
            content=artist_content,
            visible_to=models.VisibleTo.ARTIST,
            system_key="event_finished_v1:artist",
        )

        results["post_event_prompts_created"] += 2

    return results


def handle_auto_completion(db: Session) -> dict:
    """Auto-complete bookings 12h after end_time when no dispute is open."""
    now = datetime.utcnow()
    results = {"auto_completed": 0, "skipped_due_to_dispute": 0}

    bookings = (
        db.query(models.Booking)
        .filter(
            models.Booking.status.in_(
                [models.BookingStatus.CONFIRMED, models.BookingStatus.COMPLETED]
            ),
            models.Booking.end_time != None,  # noqa: E711
            models.Booking.end_time <= now - timedelta(hours=12),
        )
        .all()
    )
    for b in bookings:
        if _has_open_dispute(db, int(b.id)):
            results["skipped_due_to_dispute"] += 1
            continue

        prev_status = b.status
        just_completed = False
        if b.status == models.BookingStatus.CONFIRMED:
            b.status = models.BookingStatus.COMPLETED
            db.add(b)
            db.commit()
            just_completed = True

        br_id = _resolve_booking_request_id(db, b)
        if br_id:
            if just_completed:
                _post_system(
                    db,
                    br_id,
                    actor_id=b.artist_id,
                    content=(
                        "This event has been automatically marked as completed. "
                        "If you still need help, you can contact support from this conversation."
                    ),
                    visible_to=models.VisibleTo.BOTH,
                    system_key="event_auto_completed_v1",
                )
            # Best-effort review invite system lines for both sides
            try:
                existing_invite = (
                    db.query(models.Message)
                    .filter(
                        models.Message.booking_request_id == br_id,
                        models.Message.message_type == models.MessageType.SYSTEM,
                        models.Message.system_key == "review_invite_client_v1",
                    )
                    .first()
                )
                if not existing_invite:
                    artist_profile = (
                        db.query(models.ServiceProviderProfile)
                        .filter(models.ServiceProviderProfile.user_id == b.artist_id)
                        .first()
                    )
                    provider_name = (
                        (artist_profile.business_name or "").strip()
                        if artist_profile and artist_profile.business_name
                        else ""
                    )
                    content = (
                        f"How was your event with {provider_name or 'your service provider'}? "
                        "Leave a rating and short review to help others book with confidence."
                    )
                    _post_system(
                        db,
                        br_id,
                        actor_id=b.artist_id,
                        content=content,
                        visible_to=models.VisibleTo.CLIENT,
                        system_key="review_invite_client_v1",
                    )
                # Provider-side invite to review the client
                existing_provider_invite = (
                    db.query(models.Message)
                    .filter(
                        models.Message.booking_request_id == br_id,
                        models.Message.message_type == models.MessageType.SYSTEM,
                        models.Message.system_key == "review_invite_provider_v1",
                    )
                    .first()
                )
                if not existing_provider_invite:
                    client = (
                        db.query(models.User)
                        .filter(models.User.id == b.client_id)
                        .first()
                    )
                    client_label = (
                        f"{client.first_name} {client.last_name}".strip()
                        if client
                        else "this client"
                    )
                    provider_invite_content = (
                        f"How was your experience with {client_label}? "
                        "Share a short review to help you and other providers identify reliable clients."
                    )
                    _post_system(
                        db,
                        br_id,
                        actor_id=b.artist_id,
                        content=provider_invite_content,
                        visible_to=models.VisibleTo.ARTIST,
                        system_key="review_invite_provider_v1",
                    )
            except Exception:
                pass
        try:
            from ..utils.notifications import notify_review_request

            if prev_status != models.BookingStatus.COMPLETED and just_completed:
                client = (
                    db.query(models.User)
                    .filter(models.User.id == b.client_id)
                    .first()
                )
                notify_review_request(db, client, int(b.id))
        except Exception:
            pass

        results["auto_completed"] += 1

    return results


def handle_pv_auto_completion(db: Session) -> dict:
    """Auto-complete delivered Personalized Video orders once auto_complete_at_utc passes.

    PV orders are stored as BookingRequest rows with service_extras['pv'].
    We gate this behind ENABLE_PV_ORDERS so legacy PV threads remain unchanged
    until the v2 rollout is enabled.
    """
    if not settings.ENABLE_PV_ORDERS:
        return {"pv_auto_completed": 0, "pv_skipped_due_to_dispute": 0}

    from decimal import Decimal

    from ..schemas.pv import PvStatus
    from ..services.pv_orders import load_pv_payload, save_pv_payload

    now = datetime.utcnow()
    results = {"pv_auto_completed": 0, "pv_skipped_due_to_dispute": 0}

    q = db.query(models.BookingRequest).order_by(models.BookingRequest.id.asc())
    try:
        if db.bind and db.bind.dialect.name == "postgresql":
            q = q.filter(text("service_extras::jsonb ? 'pv'"))
    except Exception:
        pass

    rows = q.all()
    for br in rows:
        extras = getattr(br, "service_extras", None)
        if not isinstance(extras, dict) or "pv" not in extras:
            continue

        try:
            pv = load_pv_payload(br)
        except Exception:
            continue

        if pv.status != PvStatus.DELIVERED:
            continue
        if pv.auto_complete_at_utc is None or pv.auto_complete_at_utc > now:
            continue
        if not pv.booking_simple_id:
            continue

        simple_id = int(pv.booking_simple_id)
        if _has_open_simple_dispute(db, simple_id):
            results["pv_skipped_due_to_dispute"] += 1
            continue

        simple = (
            db.query(models.BookingSimple)
            .filter(models.BookingSimple.id == simple_id)
            .first()
        )
        if not simple:
            continue
        if (getattr(simple, "booking_type", "") or "").lower() != "personalized_video":
            continue
        if (getattr(simple, "payment_status", "") or "").lower() != "paid":
            continue

        pv.status = PvStatus.COMPLETED
        pv.completed_at_utc = pv.completed_at_utc or now
        pv.payout_state = "payable"
        save_pv_payload(br, pv)
        br.status = models.BookingStatus.REQUEST_COMPLETED
        db.add(br)
        db.commit()

        # Create queued payout rows if missing (idempotent).
        try:
            from ..api.api_payment import _ensure_payout_rows  # noqa: WPS433

            ref = (
                str(pv.paystack_reference or "").strip()
                or str(getattr(simple, "payment_id", "") or "").strip()
                or f"pv_auto_complete:{br.id}"
            )
            _ensure_payout_rows(
                db,
                simple=simple,
                total_amount=Decimal(str(pv.total or 0)),
                reference=ref,
                phase="pv_auto_complete",
            )
        except Exception:
            pass

        # Emit a system line for both parties.
        try:
            _post_system(
                db,
                br.id,
                actor_id=int(br.artist_id),
                content=(
                    "This personalised video order has been automatically marked as completed. "
                    "If you still need help, you can contact support from this conversation."
                ),
                visible_to=models.VisibleTo.BOTH,
                system_key="pv_auto_completed_v1",
            )
        except Exception:
            pass

        results["pv_auto_completed"] += 1

    return results


def run_maintenance() -> dict:
    """Run all operational maintenance tasks once and return a summary.

    Each task gets its own short-lived DB session to minimize how long a
    connection is held. This avoids tying up a connection for the entire
    maintenance cycle.
    """
    # Sound outreach nudges/expiry
    with SessionLocal() as db:
        so = handle_sound_outreach_nudges_and_expiry(db)

    # Pre-event reminders
    with SessionLocal() as db:
        pre = handle_pre_event_reminders(db)

    # Post-event prompts
    with SessionLocal() as db:
        post = handle_post_event_prompts(db)

    # Auto-completion
    with SessionLocal() as db:
        auto = handle_auto_completion(db)

    # PV auto-completion
    with SessionLocal() as db:
        pv_auto = handle_pv_auto_completion(db)

    # Artist accept timeouts
    with SessionLocal() as db:
        artist_timeouts = handle_artist_accept_timeouts(db)

    return {**so, "pre_event_messages": pre, **post, **auto, **pv_auto, **artist_timeouts}


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
