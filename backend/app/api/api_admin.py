from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, asc, desc
from typing import Any, Dict, List, Tuple
from datetime import datetime
import os

from ..database import get_db
from ..models import Booking, Review, Service, User, AdminUser
from sqlalchemy import JSON
from ..models.booking_status import BookingStatus
from ..api.auth import get_user_by_email
from ..utils.auth import verify_password, normalize_email
from ..utils.redis_cache import invalidate_artist_list_cache
from ..utils.notifications import notify_listing_moderation, notify_user_new_message
from ..crud import crud_message
from .. import models
from ..api.auth import create_access_token, get_current_user


router = APIRouter(prefix="/admin", tags=["admin"])


# ────────────────────────────────────────────────────────────────────────────────
# Admin access control
# Allow either explicit admin users (admin_users table) or email/domain allowlist
# via env vars: ADMIN_EMAILS, ADMIN_DOMAIN (comma-separated for multiple domains)

def _email_in_allowlist(email: str) -> bool:
    email = (email or "").lower()
    allow_emails = [e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()]
    allow_domains = [d.strip().lower() for d in os.getenv("ADMIN_DOMAINS", "").split(",") if d.strip()]
    if email in allow_emails:
        return True
    domain = email.split("@")[-1] if "@" in email else ""
    return domain in allow_domains if domain else False


def _ensure_admin_user_record(db: Session, user: User) -> AdminUser | None:
    admin = db.query(AdminUser).filter(AdminUser.user_id == user.id).first()
    if admin:
        return admin
    if _email_in_allowlist(user.email):
        admin = AdminUser(user_id=user.id, email=user.email, role=os.getenv("DEFAULT_ADMIN_ROLE", "admin"))
        db.add(admin)
        db.commit()
        db.refresh(admin)
        return admin
    return None


def get_current_admin_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Tuple[User, AdminUser]:
    admin = db.query(AdminUser).filter(AdminUser.user_id == current_user.id).first()
    if not admin:
        admin = _ensure_admin_user_record(db, current_user)
    if not admin:
        # Last resort: allow superusers via env allowlist only
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user, admin


def require_roles(*roles):
    def _dep(current=Depends(get_current_admin_user)):
        user, admin = current
        if admin.role == "superadmin" or admin.role in roles or admin.role == "admin":
            return current
        raise HTTPException(status_code=403, detail="Insufficient role")
    return _dep


# ────────────────────────────────────────────────────────────────────────────────
# React-Admin compatible auth endpoints under /admin/auth

@router.post("/auth/login")
def admin_login(payload: Dict[str, str], db: Session = Depends(get_db)):
    email = normalize_email(payload.get("email", ""))
    password = payload.get("password", "")
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    admin = _ensure_admin_user_record(db, user)
    if not admin and not _email_in_allowlist(email):
        raise HTTPException(status_code=403, detail="Admin access required")
    token = create_access_token({"sub": user.email})
    return {"token": token, "user": {"id": str(user.id), "email": user.email, "role": (admin.role if admin else "admin")}}


@router.get("/auth/me")
def admin_me(_: Tuple[User, AdminUser] = Depends(get_current_admin_user)):
    return {"status": "ok"}


@router.post("/auth/logout")
def admin_logout():
    # Stateless JWT – client should discard; optionally we could blacklist tokens.
    return {"status": "ok"}


# ────────────────────────────────────────────────────────────────────────────────
# Utilities for RA list/query handling

def _parse_json_param(params, key: str):
    val = params.get(key)
    if not val:
        return None
    try:
        import json

        return json.loads(val)
    except Exception:
        return None


def _get_offset_limit(params) -> Tuple[int, int, int, int]:
    """Return (offset, limit, start, end) parsed from ra-data-simple-rest range or fallback to page/perPage.

    ra-data-simple-rest sends: range=[start,end], sort=[field,order], filter={...}
    """
    rng = _parse_json_param(params, "range")
    if isinstance(rng, list) and len(rng) == 2:
        start = max(int(rng[0]), 0)
        end = max(int(rng[1]), start)
        limit = end - start + 1
        return start, limit, start, end
    # Fallback to _page/_perPage
    try:
        page = max(int(params.get("_page", 1)), 1)
        per_page = max(1, min(int(params.get("_perPage", 25)), 200))
    except Exception:
        page, per_page = 1, 25
    start = (page - 1) * per_page
    end = start + per_page - 1
    return start, per_page, start, end


def _apply_ra_sorting(query, model, params):
    sort = _parse_json_param(params, "sort")
    if isinstance(sort, list) and len(sort) == 2:
        field, order = sort[0], str(sort[1]).upper()
        if field and hasattr(model, field):
            col = getattr(model, field)
            return query.order_by(asc(col) if order == "ASC" else desc(col))
    # Fallback to _sort/_order
    sort_field = params.get("_sort")
    order = params.get("_order", "ASC").upper()
    if sort_field and hasattr(model, sort_field):
        col = getattr(model, sort_field)
        return query.order_by(asc(col) if order == "ASC" else desc(col))
    return query


def _apply_ra_filters(query, model, params):
    filters = _parse_json_param(params, "filter") or {}
    # Also allow q via either filter.q or query param q
    qval = filters.get("q") if isinstance(filters, dict) else None
    qval = qval or params.get("q")
    if qval:
        ilike = f"%{qval}%"
        text_cols = [
            c for c in getattr(model, "__table__").columns
            if str(c.type).lower().startswith("varchar") or str(c.type).lower().startswith("text")
        ]
        if text_cols:
            from sqlalchemy import or_

            ors = [getattr(model, c.name).ilike(ilike) for c in text_cols]
            query = query.filter(or_(*ors))

    if isinstance(filters, dict):
        for key, value in filters.items():
            if key == "q":
                continue
            if hasattr(model, key):
                query = query.filter(getattr(model, key) == value)
    # Also support direct query params as equality filters
    skip = {"_page", "_perPage", "_sort", "_order", "q", "filter", "range", "sort"}
    for key, value in params.items():
        if key in skip:
            continue
        if hasattr(model, key):
            query = query.filter(getattr(model, key) == value)
    return query


def _paginate_offset(query, offset: int, limit: int):
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return total, items


def _with_total(items: List[Dict[str, Any]], total: int, resource: str, start: int, end: int) -> JSONResponse:
    resp = JSONResponse(items)
    # Expose both headers for compatibility with different RA providers
    resp.headers["Access-Control-Expose-Headers"] = "X-Total-Count, Content-Range"
    resp.headers["X-Total-Count"] = str(total)
    resp.headers["Content-Range"] = f"{resource} {start}-{end}/{total}"
    return resp


# ────────────────────────────────────────────────────────────────────────────────
# Resource mappers → shape backend models for the admin UI

def booking_to_admin(b: Booking) -> Dict[str, Any]:
    # Map to UI expectations
    try:
        total_cents = int(float(b.total_price) * 100)
    except Exception:
        total_cents = 0
    return {
        "id": str(b.id),
        "status": str(b.status.value if hasattr(b.status, "value") else b.status),
        "event_date": (b.start_time.isoformat() if getattr(b, "start_time", None) else None),
        "location": getattr(b, "event_city", None),
        "total_amount": total_cents,
        "created_at": (getattr(b, "created_at", None).isoformat() if getattr(b, "created_at", None) else None),
        "client_id": str(getattr(b, "client_id", "") or ""),
        "provider_id": str(getattr(b, "artist_id", "") or ""),
        "listing_id": str(getattr(b, "service_id", "") or ""),
    }


def service_to_listing(s: Service) -> Dict[str, Any]:
    return {
        "id": str(s.id),
        "title": s.title,
        "description": getattr(s, "description", None),
        "media_url": getattr(s, "media_url", None),
        "price": float(s.price) if getattr(s, "price", None) is not None else None,
        "currency": getattr(s, "currency", None),
        "duration_minutes": getattr(s, "duration_minutes", None),
        "display_order": getattr(s, "display_order", None),
        "service_category_id": getattr(s, "service_category_id", None),
        "category": (s.service_type if isinstance(s.service_type, str) else getattr(s.service_type, "value", "")),
        "status": getattr(s, "status", None) or "pending_review",
        "updated_at": (getattr(s, "updated_at", None).isoformat() if getattr(s, "updated_at", None) else None),
    }


def review_to_admin(r: Review) -> Dict[str, Any]:
    return {
        "id": str(r.id),
        "booking_id": str(r.booking_id),
        "provider_id": str(r.artist_id),
        "rating": int(r.rating),
        "text": getattr(r, "comment", None),
        "verified": False,
        "created_at": (getattr(r, "created_at", None).isoformat() if getattr(r, "created_at", None) else None),
    }


# ────────────────────────────────────────────────────────────────────────────────
# Bookings

@router.get("/bookings")
def list_bookings(request: Request, _: Tuple[User, AdminUser] = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    q = db.query(Booking)
    # Special filter: today=true → bookings whose start_time is today (UTC)
    try:
        today_flag = request.query_params.get("today")
        if today_flag and str(today_flag).lower() not in ("0", "false", "off"):
            from datetime import datetime, timezone, timedelta

            now = datetime.now(timezone.utc)
            start = datetime(year=now.year, month=now.month, day=now.day, tzinfo=timezone.utc)
            end = start + timedelta(days=1)
            if hasattr(Booking, "start_time"):
                q = q.filter(Booking.start_time >= start).filter(Booking.start_time < end)
    except Exception:
        pass

    q = _apply_ra_filters(q, Booking, request.query_params)
    q = _apply_ra_sorting(q, Booking, request.query_params)
    total, items = _paginate_offset(q, offset, limit)
    return _with_total([booking_to_admin(b) for b in items], total, "bookings", start, start + len(items) - 1)


@router.get("/bookings/{booking_id}")
def get_booking(booking_id: int, _: Tuple[User, AdminUser] = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    return booking_to_admin(b)


@router.post("/bookings/{booking_id}/complete")
def complete_booking(booking_id: int, _: Tuple[User, AdminUser] = Depends(require_roles("payments", "trust", "admin", "superadmin")), db: Session = Depends(get_db)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        before = booking_to_admin(b)
        b.status = BookingStatus.COMPLETED
        db.add(b)
        db.commit()
        db.refresh(b)
        after = booking_to_admin(b)
        _audit(db, _[1].id, "booking", str(booking_id), "mark_completed", before, after)
        return after
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed")


@router.post("/bookings/{booking_id}/refund")
def refund_booking(booking_id: int, payload: Dict[str, Any], _: Tuple[User, AdminUser] = Depends(require_roles("payments", "admin", "superadmin")), db: Session = Depends(get_db)):
    # Domain-specific refund logic should live in payments APIs.
    # This is a placeholder acknowledging the action; integrate with Stripe, etc.
    amount = int(payload.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    try:
        # Record a ledger refund entry
        db.execute(
            text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'refund', :amt, 'ZAR', :meta)"),
            {"bid": booking_id, "amt": amount / 100.0, "meta": json.dumps({"source": "admin"})},
        )
        db.commit()
    except Exception:
        db.rollback()
    _audit(db, _[1].id, "booking", str(booking_id), "refund", None, {"amount": amount})
    return {"status": "queued", "booking_id": str(booking_id), "amount": amount}


# ────────────────────────────────────────────────────────────────────────────────
# Listings (Services)

@router.get("/listings")
def list_listings(request: Request, _: Tuple[User, AdminUser] = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    q = db.query(Service)
    q = _apply_ra_filters(q, Service, request.query_params)
    q = _apply_ra_sorting(q, Service, request.query_params)
    total, items = _paginate_offset(q, offset, limit)
    return _with_total([service_to_listing(s) for s in items], total, "listings", start, start + len(items) - 1)


@router.get("/listings/{listing_id}")
def get_listing(listing_id: int, _: Tuple[User, AdminUser] = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    s = db.query(Service).filter(Service.id == listing_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    return service_to_listing(s)


@router.post("/listings/{listing_id}/approve")
def approve_listing(listing_id: int, _: Tuple[User, AdminUser] = Depends(require_roles("content", "admin", "superadmin")), db: Session = Depends(get_db)):
    s = db.query(Service).filter(Service.id == listing_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    before = service_to_listing(s)
    try:
        setattr(s, "status", "approved")
        db.add(s)
        db.commit()
        db.refresh(s)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed")
    after = service_to_listing(s)
    _audit(db, _[1].id, "service", str(listing_id), "approve", before, after)
    # Moderation log
    try:
        db.execute(text("INSERT INTO service_moderation_logs (service_id, admin_id, action) VALUES (:sid, :aid, 'approve')"), {"sid": listing_id, "aid": _[1].id})
        db.commit()
    except Exception:
        db.rollback()
    try:
        invalidate_artist_list_cache()
    except Exception:
        pass
    # Post a system message in the provider's latest thread; if none exists, create one with the Booka system user
    try:
        system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
        system_user = db.query(User).filter(func.lower(User.email) == system_email).first()
        if not system_user:
            # Create a minimal Booka system user on-the-fly if missing
            try:
                system_user = User(
                    email=system_email,
                    password="!disabled-system-user!",
                    first_name="Booka",
                    last_name="",
                    phone_number=None,
                    is_active=True,
                    is_verified=True,
                    user_type=models.UserType.CLIENT,
                )
                db.add(system_user)
                db.commit()
                db.refresh(system_user)
            except Exception:
                db.rollback()
        br = (
            db.query(models.BookingRequest)
            .filter(models.BookingRequest.artist_id == s.artist_id)
            .order_by(models.BookingRequest.created_at.desc())
            .first()
        )
        if not br and system_user:
            # Create a lightweight system thread so the artist sees Booka updates in Inbox
            br = models.BookingRequest(
                client_id=system_user.id,
                artist_id=s.artist_id,
                service_id=s.id,
                status=models.BookingStatus.PENDING_QUOTE,
            )
            db.add(br)
            db.commit()
            db.refresh(br)
        if br:
            msg = (
                f"Listing approved: {s.title}\n"
                f"Congratulations! Your listing has been approved and is now live.\n"
                f"View listing: /services/{s.id}\n"
                f"Need help? Contact support at support@booka.co.za."
            )
            m = crud_message.create_message(
                db,
                booking_request_id=br.id,
                sender_id=(system_user.id if system_user else br.artist_id),
                sender_type=models.SenderType.CLIENT,
                content=msg,
                message_type=models.MessageType.SYSTEM,
                visible_to=models.VisibleTo.BOTH,
                system_key=f"listing_approved_v1:{s.id}",
            )
            try:
                artist_user = db.query(User).filter(User.id == s.artist_id).first()
                if artist_user and system_user:
                    notify_user_new_message(
                        db,
                        user=artist_user,
                        sender=system_user,
                        booking_request_id=br.id,
                        content=msg,
                        message_type=models.MessageType.SYSTEM,
                    )
            except Exception:
                pass
    except Exception:
        pass
    try:
        notify_listing_moderation(db, s, approved=True)
    except Exception:
        pass
    return after


@router.post("/listings/{listing_id}/reject")
def reject_listing(listing_id: int, payload: Dict[str, Any], _: Tuple[User, AdminUser] = Depends(require_roles("content", "admin", "superadmin")), db: Session = Depends(get_db)):
    s = db.query(Service).filter(Service.id == listing_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    before = service_to_listing(s)
    reason = payload.get("reason")
    try:
        setattr(s, "status", "rejected")
        db.add(s)
        db.commit()
        db.refresh(s)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed")
    after = service_to_listing(s)
    _audit(db, _[1].id, "service", str(listing_id), "reject", before, {**after, "reason": reason})
    try:
        db.execute(text("INSERT INTO service_moderation_logs (service_id, admin_id, action, reason) VALUES (:sid, :aid, 'reject', :reason)"), {"sid": listing_id, "aid": _[1].id, "reason": reason})
        db.commit()
    except Exception:
        db.rollback()
    try:
        invalidate_artist_list_cache()
    except Exception:
        pass
    # Post a system message (rejection) to the provider's latest thread; create one if none exists
    try:
        system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
        system_user = db.query(User).filter(func.lower(User.email) == system_email).first()
        if not system_user:
            try:
                system_user = User(
                    email=system_email,
                    password="!disabled-system-user!",
                    first_name="Booka",
                    last_name="",
                    phone_number=None,
                    is_active=True,
                    is_verified=True,
                    user_type=models.UserType.CLIENT,
                )
                db.add(system_user)
                db.commit()
                db.refresh(system_user)
            except Exception:
                db.rollback()
        br = (
            db.query(models.BookingRequest)
            .filter(models.BookingRequest.artist_id == s.artist_id)
            .order_by(models.BookingRequest.created_at.desc())
            .first()
        )
        if not br and system_user:
            br = models.BookingRequest(
                client_id=system_user.id,
                artist_id=s.artist_id,
                service_id=s.id,
                status=models.BookingStatus.PENDING_QUOTE,
            )
            db.add(br)
            db.commit()
            db.refresh(br)
        if br:
            msg = (
                f"Listing rejected: {s.title}\n"
                f"Reason: {reason or 'No reason provided'}.\n"
                f"You can update your listing and resubmit.\n"
                f"View listing: /dashboard/artist?tab=services\n"
                f"Need help? Contact support at support@booka.co.za."
            )
            m = crud_message.create_message(
                db,
                booking_request_id=br.id,
                sender_id=(system_user.id if system_user else br.artist_id),
                sender_type=models.SenderType.CLIENT,
                content=msg,
                message_type=models.MessageType.SYSTEM,
                visible_to=models.VisibleTo.BOTH,
                system_key=f"listing_rejected_v1:{s.id}",
            )
            try:
                artist_user = db.query(User).filter(User.id == s.artist_id).first()
                if artist_user and system_user:
                    notify_user_new_message(
                        db,
                        user=artist_user,
                        sender=system_user,
                        booking_request_id=br.id,
                        content=msg,
                        message_type=models.MessageType.SYSTEM,
                    )
            except Exception:
                pass
    except Exception:
        pass
    try:
        notify_listing_moderation(db, s, approved=False, reason=reason)
    except Exception:
        pass
    return after


@router.get("/listings/{listing_id}/moderation_logs")
def list_moderation_logs(listing_id: int, _: Tuple[User, AdminUser] = Depends(require_roles("content", "admin", "superadmin")), db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT id, action, reason, at, admin_id FROM service_moderation_logs WHERE service_id=:sid ORDER BY at DESC"), {"sid": listing_id}).fetchall()
    return [{"id": str(r[0]), "action": r[1], "reason": r[2], "at": r[3], "admin_id": str(r[4])} for r in rows]


@router.post("/listings/bulk_approve")
def bulk_approve(payload: Dict[str, Any], _: Tuple[User, AdminUser] = Depends(require_roles("content", "admin", "superadmin")), db: Session = Depends(get_db)):
    ids = payload.get("ids") or []
    count = 0
    for sid in ids:
        s = db.query(Service).filter(Service.id == sid).first()
        if not s:
            continue
        before = service_to_listing(s)
        try:
            setattr(s, "status", "approved")
            db.add(s)
            db.commit()
            db.refresh(s)
            _audit(db, _[1].id, "service", str(sid), "approve", before, service_to_listing(s))
            db.execute(text("INSERT INTO service_moderation_logs (service_id, admin_id, action) VALUES (:sid, :aid, 'approve')"), {"sid": sid, "aid": _[1].id})
            db.commit()
            # System message to latest thread for this artist (create if none exists)
            try:
                system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
                system_user = db.query(User).filter(func.lower(User.email) == system_email).first()
                if not system_user:
                    try:
                        system_user = User(
                            email=system_email,
                            password="!disabled-system-user!",
                            first_name="Booka",
                            last_name="",
                            phone_number=None,
                            is_active=True,
                            is_verified=True,
                            user_type=models.UserType.CLIENT,
                        )
                        db.add(system_user)
                        db.commit()
                        db.refresh(system_user)
                    except Exception:
                        db.rollback()
                br = (
                    db.query(models.BookingRequest)
                    .filter(models.BookingRequest.artist_id == s.artist_id)
                    .order_by(models.BookingRequest.created_at.desc())
                    .first()
                )
                if not br and system_user:
                    br = models.BookingRequest(
                        client_id=system_user.id,
                        artist_id=s.artist_id,
                        service_id=s.id,
                        status=models.BookingStatus.PENDING_QUOTE,
                    )
                    db.add(br)
                    db.commit()
                    db.refresh(br)
                if br:
                    msg = (
                        f"Listing approved: {s.title}\n"
                        f"Congratulations! Your listing has been approved and is now live.\n"
                        f"View listing: /services/{s.id}\n"
                        f"Need help? Contact support at support@booka.co.za."
                    )
                    m = crud_message.create_message(
                        db,
                        booking_request_id=br.id,
                        sender_id=(system_user.id if system_user else br.artist_id),
                        sender_type=models.SenderType.CLIENT,
                        content=msg,
                        message_type=models.MessageType.SYSTEM,
                        visible_to=models.VisibleTo.BOTH,
                        system_key=f"listing_approved_v1:{s.id}",
                    )
                    try:
                        artist_user = db.query(User).filter(User.id == s.artist_id).first()
                        if artist_user and system_user:
                            notify_user_new_message(
                                db,
                                user=artist_user,
                                sender=system_user,
                                booking_request_id=br.id,
                                content=msg,
                                message_type=models.MessageType.SYSTEM,
                            )
                    except Exception:
                        pass
            except Exception:
                pass
            try:
                notify_listing_moderation(db, s, approved=True)
            except Exception:
                pass
            count += 1
        except Exception:
            db.rollback()
            continue
    try:
        invalidate_artist_list_cache()
    except Exception:
        pass
    try:
        invalidate_artist_list_cache()
    except Exception:
        pass
    return {"updated": count}


@router.post("/listings/bulk_reject")
def bulk_reject(payload: Dict[str, Any], _: Tuple[User, AdminUser] = Depends(require_roles("content", "admin", "superadmin")), db: Session = Depends(get_db)):
    ids = payload.get("ids") or []
    reason = payload.get("reason")
    count = 0
    for sid in ids:
        s = db.query(Service).filter(Service.id == sid).first()
        if not s:
            continue
        before = service_to_listing(s)
        try:
            setattr(s, "status", "rejected")
            db.add(s)
            db.commit()
            db.refresh(s)
            _audit(db, _[1].id, "service", str(sid), "reject", before, {**service_to_listing(s), "reason": reason})
            db.execute(text("INSERT INTO service_moderation_logs (service_id, admin_id, action, reason) VALUES (:sid, :aid, 'reject', :reason)"), {"sid": sid, "aid": _[1].id, "reason": reason})
            db.commit()
            # System message for rejection (create if none exists)
            try:
                system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
                system_user = db.query(User).filter(func.lower(User.email) == system_email).first()
                if not system_user:
                    try:
                        system_user = User(
                            email=system_email,
                            password="!disabled-system-user!",
                            first_name="Booka",
                            last_name="",
                            phone_number=None,
                            is_active=True,
                            is_verified=True,
                            user_type=models.UserType.CLIENT,
                        )
                        db.add(system_user)
                        db.commit()
                        db.refresh(system_user)
                    except Exception:
                        db.rollback()
                br = (
                    db.query(models.BookingRequest)
                    .filter(models.BookingRequest.artist_id == s.artist_id)
                    .order_by(models.BookingRequest.created_at.desc())
                    .first()
                )
                if not br and system_user:
                    br = models.BookingRequest(
                        client_id=system_user.id,
                        artist_id=s.artist_id,
                        service_id=s.id,
                        status=models.BookingStatus.PENDING_QUOTE,
                    )
                    db.add(br)
                    db.commit()
                    db.refresh(br)
                if br:
                    msg = (
                        f"Listing rejected: {s.title}\n"
                        f"Reason: {reason or 'No reason provided'}.\n"
                        f"You can update your listing and resubmit.\n"
                        f"View listing: /dashboard/artist?tab=services\n"
                        f"Need help? Contact support at support@booka.co.za."
                    )
                    m = crud_message.create_message(
                        db,
                        booking_request_id=br.id,
                        sender_id=(system_user.id if system_user else br.artist_id),
                        sender_type=models.SenderType.CLIENT,
                        content=msg,
                        message_type=models.MessageType.SYSTEM,
                        visible_to=models.VisibleTo.BOTH,
                        system_key=f"listing_rejected_v1:{s.id}",
                    )
                    try:
                        artist_user = db.query(User).filter(User.id == s.artist_id).first()
                        if artist_user and system_user:
                            notify_user_new_message(
                                db,
                                user=artist_user,
                                sender=system_user,
                                booking_request_id=br.id,
                                content=msg,
                                message_type=models.MessageType.SYSTEM,
                            )
                    except Exception:
                        pass
            except Exception:
                pass
            try:
                notify_listing_moderation(db, s, approved=False, reason=reason)
            except Exception:
                pass
            count += 1
        except Exception:
            db.rollback()
            continue
    return {"updated": count}


# ────────────────────────────────────────────────────────────────────────────────
# Reviews

@router.get("/reviews")
def list_reviews(request: Request, _: Tuple[User, AdminUser] = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    q = db.query(Review)
    q = _apply_ra_filters(q, Review, request.query_params)
    q = _apply_ra_sorting(q, Review, request.query_params)
    total, items = _paginate_offset(q, offset, limit)
    return _with_total([review_to_admin(r) for r in items], total, "reviews", start, start + len(items) - 1)


@router.get("/reviews/{review_id}")
def get_review(review_id: int, _: Tuple[User, AdminUser] = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    r = db.query(Review).filter(Review.id == review_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return review_to_admin(r)


# ────────────────────────────────────────────────────────────────────────────────
# Admin Users (RBAC)

@router.get("/admin_users")
def list_admin_users(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    q = db.query(AdminUser)
    q = _apply_ra_filters(q, AdminUser, request.query_params)
    q = _apply_ra_sorting(q, AdminUser, request.query_params)
    total, items = _paginate_offset(q, offset, limit)
    def to_dict(a: AdminUser):
        return {"id": str(a.id), "email": a.email, "role": a.role, "created_at": (a.created_at.isoformat() if a.created_at else None)}
    return _with_total([to_dict(a) for a in items], total, "admin_users", start, start + len(items) - 1)


@router.get("/admin_users/{admin_id}")
def get_admin_user(admin_id: int, _: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    a = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": str(a.id), "email": a.email, "role": a.role, "created_at": (a.created_at.isoformat() if a.created_at else None)}


@router.put("/admin_users/{admin_id}")
def update_admin_user(admin_id: int, payload: Dict[str, Any], _: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    a = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    role = payload.get("role")
    email = payload.get("email")
    if role:
        a.role = str(role)
    if email and email != a.email:
        # Allow email change only if user record matches; optional
        u = get_user_by_email(db, email)
        if not u:
            raise HTTPException(status_code=400, detail="Email not linked to a user")
        a.email = email
        a.user_id = u.id
    before = {"email": a.email, "role": a.role}
    db.add(a)
    db.commit()
    db.refresh(a)
    _audit(db, _[1].id, "admin_user", str(a.id), "update", before, {"email": a.email, "role": a.role})
    return {"id": str(a.id), "email": a.email, "role": a.role, "created_at": (a.created_at.isoformat() if a.created_at else None)}


# ────────────────────────────────────────────────────────────────────────────────
# Stub resources for future wiring: ledger, payouts, disputes, email_events, sms_events, audit_events

def _empty_list_response(resource: str) -> JSONResponse:
    return _with_total([], 0, resource, 0, 0)


@router.get("/ledger")
def list_ledger(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("payments", "admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    filters = _parse_json_param(request.query_params, 'filter') or {}
    where = []
    params: Dict[str, Any] = {"lim": limit, "off": offset}
    if isinstance(filters, dict):
        if filters.get('type'):
            where.append("type = :type")
            params['type'] = filters['type']
        if filters.get('booking_id'):
            where.append("booking_id = :bid")
            params['bid'] = filters['booking_id']
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db.execute(text(f"SELECT id, booking_id, type, amount, currency, created_at, meta FROM ledger_entries {where_sql} ORDER BY created_at DESC LIMIT :lim OFFSET :off"), params).fetchall()
    total = db.execute(text(f"SELECT COUNT(*) FROM ledger_entries {where_sql}"), {k:v for k,v in params.items() if k in ('type','bid')}).scalar() or 0
    items = [{"id": str(r[0]), "booking_id": (str(r[1]) if r[1] is not None else None), "type": r[2], "amount": float(r[3] or 0), "currency": r[4], "created_at": r[5], "meta": r[6]} for r in rows]
    return _with_total(items, int(total), "ledger", start, start + len(items) - 1)


@router.get("/payouts")
def list_payouts(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("payments", "admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    rows = db.execute(text("SELECT id, provider_id, amount, currency, status, batch_id, created_at FROM payouts ORDER BY created_at DESC LIMIT :lim OFFSET :off"), {"lim": limit, "off": offset}).fetchall()
    total = db.execute(text("SELECT COUNT(*) FROM payouts")).scalar() or 0
    items = [
        {
            "id": str(r[0]),
            "provider_id": str(r[1]) if r[1] is not None else None,
            "amount": float(r[2] or 0),
            "currency": r[3] or "ZAR",
            "status": r[4] or "queued",
            "batch_id": r[5],
            "created_at": r[6],
        }
        for r in rows
    ]
    return _with_total(items, int(total), "payouts", start, start + len(items) - 1)


@router.post("/payout_batches")
def create_payout_batch(payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("payments", "admin", "superadmin")), db: Session = Depends(get_db)):
    booking_ids = payload.get("bookingIds") or []
    if not isinstance(booking_ids, list) or not booking_ids:
        raise HTTPException(status_code=400, detail="bookingIds required")
    import uuid, json
    batch_id = f"pb_{uuid.uuid4().hex[:10]}"
    # Naive computation: 80% to provider if charged_total_amount exists else 0
    created = 0
    for bid in booking_ids:
        try:
            row = db.execute(text("SELECT charged_total_amount, artist_id FROM bookings_simple WHERE id=:id"), {"id": bid}).first()
            amount = float(row[0] or 0) * 0.8 if row else 0.0
            provider_id = int(row[1]) if row and row[1] is not None else None
            db.execute(text("INSERT INTO payouts (provider_id, amount, currency, status, batch_id) VALUES (:pid, :amt, 'ZAR', 'queued', :bid)"), {"pid": provider_id, "amt": amount, "bid": batch_id})
            created += 1
        except Exception:
            db.rollback()
            continue
    db.commit()
    _audit(db, current[1].id, "payout_batch", batch_id, "create", {"bookingIds": booking_ids}, {"created": created})
    return {"status": "queued", "batch_id": batch_id, "created": created}


@router.get("/disputes")
def list_disputes(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("trust", "admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    rows = db.execute(text("SELECT id, booking_id, status, reason, created_at FROM disputes ORDER BY created_at DESC LIMIT :lim OFFSET :off"), {"lim": limit, "off": offset}).fetchall()
    total = db.execute(text("SELECT COUNT(*) FROM disputes")).scalar() or 0
    items = [{"id": str(r[0]), "booking_id": str(r[1]), "status": r[2], "reason": r[3], "created_at": r[4]} for r in rows]
    return _with_total(items, int(total), "disputes", start, start + len(items) - 1)


@router.get("/email_events")
def list_email_events(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("support", "admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    rows = db.execute(text("SELECT id, message_id, recipient, template, event, booking_id, user_id, created_at FROM email_events ORDER BY created_at DESC LIMIT :lim OFFSET :off"), {"lim": limit, "off": offset}).fetchall()
    total = db.execute(text("SELECT COUNT(*) FROM email_events")).scalar() or 0
    items = [{"id": str(r[0]), "message_id": r[1], "to": r[2], "template": r[3], "event": r[4], "booking_id": (str(r[5]) if r[5] is not None else None), "user_id": (str(r[6]) if r[6] is not None else None), "created_at": r[7]} for r in rows]
    return _with_total(items, int(total), "email_events", start, start + len(items) - 1)


@router.get("/sms_events")
def list_sms_events(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("support", "admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    rows = db.execute(text("SELECT id, sid, recipient, status, booking_id, user_id, created_at FROM sms_events ORDER BY created_at DESC LIMIT :lim OFFSET :off"), {"lim": limit, "off": offset}).fetchall()
    total = db.execute(text("SELECT COUNT(*) FROM sms_events")).scalar() or 0
    items = [{"id": str(r[0]), "sid": r[1], "to": r[2], "status": r[3], "booking_id": (str(r[4]) if r[4] is not None else None), "user_id": (str(r[5]) if r[5] is not None else None), "created_at": r[6]} for r in rows]
    return _with_total(items, int(total), "sms_events", start, start + len(items) - 1)


@router.get("/audit_events")


# Dispute lifecycle actions
@router.post("/disputes/{dispute_id}/assign")
def assign_dispute(dispute_id: int, payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("trust", "admin", "superadmin")), db: Session = Depends(get_db)):
    admin_id = payload.get("admin_id") or current[1].id
    try:
        db.execute(text("UPDATE disputes SET assigned_admin_id=:aid WHERE id=:id"), {"aid": admin_id, "id": dispute_id})
        db.commit()
        _audit(db, current[1].id, "dispute", str(dispute_id), "assign", None, {"assigned_admin_id": admin_id})
        return {"status": "ok"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Assign failed")


@router.post("/disputes/{dispute_id}/request_info")
def request_info_dispute(dispute_id: int, payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("trust", "admin", "superadmin")), db: Session = Depends(get_db)):
    note = payload.get("note")
    try:
        db.execute(text("UPDATE disputes SET status='needs_info', notes=:notes WHERE id=:id"), {"notes": json.dumps({"note": note}), "id": dispute_id})
        db.commit()
        _audit(db, current[1].id, "dispute", str(dispute_id), "request_info", None, {"note": note})
        return {"status": "ok"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Request info failed")


@router.post("/disputes/{dispute_id}/resolve")
def resolve_dispute(dispute_id: int, payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("trust", "admin", "superadmin")), db: Session = Depends(get_db)):
    outcome = payload.get("outcome")
    if outcome not in {"resolved_refund", "resolved_release", "denied"}:
        raise HTTPException(status_code=400, detail="Invalid outcome")
    note = payload.get("note")
    try:
        db.execute(text("UPDATE disputes SET status=:st, notes=:notes WHERE id=:id"), {"st": outcome, "notes": json.dumps({"note": note}), "id": dispute_id})
        db.commit()
        _audit(db, current[1].id, "dispute", str(dispute_id), "resolve", None, {"outcome": outcome, "note": note})
        return {"status": "ok"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Resolve failed")
def list_audit_events(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    rows = db.execute(text("SELECT id, actor_admin_id, entity, entity_id, action, before, after, at FROM audit_events ORDER BY at DESC LIMIT :lim OFFSET :off"), {"lim": limit, "off": offset}).fetchall()
    total = db.execute(text("SELECT COUNT(*) FROM audit_events")).scalar() or 0
    items = [{"id": str(r[0]), "actor_admin_id": str(r[1]), "entity": r[2], "entity_id": r[3], "action": r[4], "before": (json.dumps(r[5]) if r[5] is not None else None), "after": (json.dumps(r[6]) if r[6] is not None else None), "at": r[7]} for r in rows]
    return _with_total(items, int(total), "audit_events", start, start + len(items) - 1)


# ────────────────────────────────────────────────────────────────────────────────
# Audit helper

from sqlalchemy import text
import json


def _audit(db: Session, actor_admin_id: int, entity: str, entity_id: str, action: str, before: Any, after: Any):
    try:
        db.execute(
            text(
                "INSERT INTO audit_events (actor_admin_id, entity, entity_id, action, before, after) VALUES (:actor, :ent, :eid, :act, :before, :after)"
            ),
            {
                "actor": actor_admin_id,
                "ent": entity,
                "eid": entity_id,
                "act": action,
                "before": json.dumps(before) if before is not None else None,
                "after": json.dumps(after) if after is not None else None,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
