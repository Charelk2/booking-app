from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, asc, desc
from typing import Any, Dict, List, Tuple
from datetime import datetime
import os

from ..database import get_db
from ..models import Booking, Review, Service, User, AdminUser, ServiceProviderProfile
from ..models import BookingSimple, Invoice, InvoiceStatus
from sqlalchemy import JSON
from ..models.booking_status import BookingStatus
from ..api.auth import get_user_by_email
from ..utils.auth import verify_password, normalize_email
from ..utils.redis_cache import invalidate_artist_list_cache
from ..utils.notifications import notify_listing_moderation, notify_user_new_message
from .. import crud
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
            # Support React-Admin getMany: filter { ids: [..] }
            if key in ("ids", "id_in") and hasattr(model, "id"):
                try:
                    values = value if isinstance(value, list) else [value]
                    values = [int(v) for v in values]
                except Exception:
                    values = value if isinstance(value, list) else [value]
                query = query.filter(getattr(model, "id").in_(values))
                continue
            # Support filter { id: [..] }
            if key == "id" and hasattr(model, "id") and isinstance(value, list):
                try:
                    values = [int(v) for v in value]
                except Exception:
                    values = value
                query = query.filter(getattr(model, "id").in_(values))
                continue
            # Special case: allow filtering Services by provider_id → artist_id
            if model.__name__ == "Service" and key == "provider_id":
                query = query.filter(getattr(model, "artist_id") == value)
                continue
            if hasattr(model, key):
                query = query.filter(getattr(model, key) == value)
    # Also support direct query params as equality filters
    skip = {"_page", "_perPage", "_sort", "_order", "q", "filter", "range", "sort"}
    for key, value in params.items():
        if key in skip:
            continue
        if key in ("ids", "id_in") and hasattr(model, "id"):
            try:
                import json
                parsed = json.loads(value) if isinstance(value, str) else value
                values = parsed if isinstance(parsed, list) else [parsed]
                values = [int(v) for v in values]
            except Exception:
                values = value if isinstance(value, list) else [value]
            query = query.filter(getattr(model, "id").in_(values))
            continue
        # Direct query param id can be a JSON array string: id=["29","31"]
        if key == "id" and hasattr(model, "id"):
            try:
                import json
                parsed = json.loads(value) if isinstance(value, str) else value
                if isinstance(parsed, list):
                    try:
                        parsed = [int(v) for v in parsed]
                    except Exception:
                        pass
                    query = query.filter(getattr(model, "id").in_(parsed))
                    continue
            except Exception:
                pass
        if model.__name__ == "Service" and key == "provider_id":
            query = query.filter(getattr(model, "artist_id") == value)
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
    def _amount_float(v) -> float:
        try:
            return float(v) if v is not None else 0.0
        except Exception:
            return 0.0
    return {
        "id": str(b.id),
        "status": str(b.status.value if hasattr(b.status, "value") else b.status),
        "event_date": (b.start_time.isoformat() if getattr(b, "start_time", None) else None),
        "location": getattr(b, "event_city", None),
        # Present amounts in ZAR (not cents) for clarity in Admin.
        "total_amount": _amount_float(getattr(b, "total_price", None)),
        "created_at": (getattr(b, "created_at", None).isoformat() if getattr(b, "created_at", None) else None),
        "client_id": str(getattr(b, "client_id", "") or ""),
        "provider_id": str(getattr(b, "artist_id", "") or ""),
        "listing_id": str(getattr(b, "service_id", "") or ""),
        "quote_id": (str(getattr(b, 'quote_id', '')) or None),
    }


def service_to_listing(s: Service) -> Dict[str, Any]:
    return {
        "id": str(s.id),
        "provider_id": str(getattr(s, "artist_id", "") or ""),
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


def provider_to_admin(u: User, p: ServiceProviderProfile | None, services_count: int) -> Dict[str, Any]:
    return {
        "id": str(u.id),
        "email": u.email,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "phone_number": u.phone_number,
        "is_active": bool(u.is_active),
        "is_verified": bool(u.is_verified),
        "created_at": (getattr(u, "created_at", None).isoformat() if getattr(u, "created_at", None) else None),
        "business_name": getattr(p, "business_name", None) if p else None,
        "location": getattr(p, "location", None) if p else None,
        "onboarding_completed": bool(getattr(p, "onboarding_completed", False)) if p else False,
        "services_count": services_count,
    }


def client_to_admin(
    u: User,
    paid_count: int = 0,
    completed_count: int = 0,
) -> Dict[str, Any]:
    return {
        "id": str(u.id),
        "email": u.email,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "phone_number": u.phone_number,
        "is_active": bool(u.is_active),
        "is_verified": bool(u.is_verified),
        "created_at": (getattr(u, "created_at", None).isoformat() if getattr(u, "created_at", None) else None),
        "bookings_paid_count": int(paid_count or 0),
        "bookings_completed_count": int(completed_count or 0),
    }


# ────────────────────────────────────────────────────────────────────────────────
# Providers

@router.get("/providers")
def list_providers(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("support", "content", "admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    q = (
        db.query(User, ServiceProviderProfile)
        .outerjoin(ServiceProviderProfile, ServiceProviderProfile.user_id == User.id)
        .filter(User.user_type == models.UserType.SERVICE_PROVIDER)
    )
    # Apply filters/sorting based on User fields
    q_user = _apply_ra_filters(q, User, request.query_params)
    q_user = _apply_ra_sorting(q_user, User, request.query_params)
    total = q_user.count()
    rows = q_user.offset(offset).limit(limit).all()
    items: List[Dict[str, Any]] = []
    for u, p in rows:
        try:
            svc_count = db.query(func.count(Service.id)).filter(Service.artist_id == u.id).scalar() or 0
        except Exception:
            svc_count = 0
        items.append(provider_to_admin(u, p, int(svc_count)))
    return _with_total(items, total, "providers", start, start + len(items) - 1)


@router.get("/providers/{user_id}")
def get_provider(user_id: int, _: Tuple[User, AdminUser] = Depends(require_roles("support", "content", "admin", "superadmin")), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id, User.user_type == models.UserType.SERVICE_PROVIDER).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    p = db.query(ServiceProviderProfile).filter(ServiceProviderProfile.user_id == user_id).first()
    svc_count = db.query(func.count(Service.id)).filter(Service.artist_id == user_id).scalar() or 0
    return provider_to_admin(u, p, int(svc_count))


# ────────────────────────────────────────────────────────────────────────────────
# Clients (non-service providers)

@router.get("/clients")
def list_clients(
    request: Request,
    _: Tuple[User, AdminUser] = Depends(require_roles("support", "payments", "admin", "superadmin")),
    db: Session = Depends(get_db),
):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    # Base query: Users with CLIENT role; also exclude any user that somehow has a provider profile
    q = (
        db.query(User)
        .outerjoin(ServiceProviderProfile, ServiceProviderProfile.user_id == User.id)
        # Show any user that is not a service provider (no provider profile), regardless of legacy user_type values
        .filter(ServiceProviderProfile.user_id.is_(None))
    )

    # Filters/sorting on User fields
    q = _apply_ra_filters(q, User, request.query_params)
    q = _apply_ra_sorting(q, User, request.query_params)
    total = q.count()
    rows: List[User] = q.offset(offset).limit(limit).all()

    items: List[Dict[str, Any]] = []
    # For each client row, compute paid and completed counts
    for u in rows:
        # Paid bookings via BookingSimple or Invoices marked paid
        try:
            paid_bs = (
                db.query(func.count(BookingSimple.id))
                .filter(BookingSimple.client_id == u.id)
                .filter(
                    (func.lower(BookingSimple.payment_status) == "paid")
                    | ((BookingSimple.charged_total_amount.isnot(None)) & (BookingSimple.charged_total_amount > 0))
                )
                .scalar()
                or 0
            )
        except Exception:
            paid_bs = 0
        try:
            paid_invoices = (
                db.query(func.count(Invoice.id))
                .filter(Invoice.client_id == u.id)
                .filter(Invoice.status == InvoiceStatus.PAID)
                .scalar()
                or 0
            )
        except Exception:
            paid_invoices = 0
        paid_count = int(max(paid_bs, paid_invoices) if paid_bs and paid_invoices else (paid_bs or paid_invoices or 0))

        # Completed bookings via legacy Booking table
        try:
            completed_count = (
                db.query(func.count(Booking.id))
                .filter(Booking.client_id == u.id)
                .filter(Booking.status == models.BookingStatus.COMPLETED)
                .scalar()
                or 0
            )
        except Exception:
            completed_count = 0

        items.append(client_to_admin(u, paid_count, int(completed_count)))

    return _with_total(items, total, "clients", start, start + len(items) - 1)


@router.get("/clients/{user_id}")
def get_client(
    user_id: int,
    _: Tuple[User, AdminUser] = Depends(require_roles("support", "payments", "admin", "superadmin")),
    db: Session = Depends(get_db),
):
    u = (
        db.query(User)
        .outerjoin(ServiceProviderProfile, ServiceProviderProfile.user_id == User.id)
        .filter(User.id == user_id)
        .filter(ServiceProviderProfile.user_id.is_(None))
        .first()
    )
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    # Compute counts for the single client
    paid_bs = (
        db.query(func.count(BookingSimple.id))
        .filter(BookingSimple.client_id == u.id)
        .filter(
            (func.lower(BookingSimple.payment_status) == "paid")
            | ((BookingSimple.charged_total_amount.isnot(None)) & (BookingSimple.charged_total_amount > 0))
        )
        .scalar()
        or 0
    )
    paid_invoices = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.client_id == u.id)
        .filter(Invoice.status == InvoiceStatus.PAID)
        .scalar()
        or 0
    )
    paid_count = int(max(paid_bs, paid_invoices) if paid_bs and paid_invoices else (paid_bs or paid_invoices or 0))
    completed_count = (
        db.query(func.count(Booking.id))
        .filter(Booking.client_id == u.id)
        .filter(Booking.status == models.BookingStatus.COMPLETED)
        .scalar()
        or 0
    )
    return client_to_admin(u, paid_count, int(completed_count))


@router.get("/clients/export")
def export_clients_csv(
    request: Request,
    _: Tuple[User, AdminUser] = Depends(require_roles("support", "payments", "admin", "superadmin")),
    db: Session = Depends(get_db),
):
    import csv
    from io import StringIO

    # Build the same base query as list_clients, but export all (respecting filters)
    q = (
        db.query(User)
        .outerjoin(ServiceProviderProfile, ServiceProviderProfile.user_id == User.id)
        .filter(ServiceProviderProfile.user_id.is_(None))
    )
    q = _apply_ra_filters(q, User, request.query_params)
    q = _apply_ra_sorting(q, User, request.query_params)
    rows: List[User] = q.all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "email",
        "first_name",
        "last_name",
        "phone_number",
        "created_at",
        "bookings_paid_count",
        "bookings_completed_count",
    ])
    for u in rows:
        try:
            paid_bs = (
                db.query(func.count(BookingSimple.id))
                .filter(BookingSimple.client_id == u.id)
                .filter(
                    (func.lower(BookingSimple.payment_status) == "paid")
                    | ((BookingSimple.charged_total_amount.isnot(None)) & (BookingSimple.charged_total_amount > 0))
                )
                .scalar()
                or 0
            )
        except Exception:
            paid_bs = 0
        try:
            paid_invoices = (
                db.query(func.count(Invoice.id))
                .filter(Invoice.client_id == u.id)
                .filter(Invoice.status == InvoiceStatus.PAID)
                .scalar()
                or 0
            )
        except Exception:
            paid_invoices = 0
        paid_count = int(max(paid_bs, paid_invoices) if paid_bs and paid_invoices else (paid_bs or paid_invoices or 0))
        try:
            completed_count = (
                db.query(func.count(Booking.id))
                .filter(Booking.client_id == u.id)
                .filter(Booking.status == models.BookingStatus.COMPLETED)
                .scalar()
                or 0
            )
        except Exception:
            completed_count = 0
        writer.writerow([
            str(u.id),
            u.email,
            u.first_name,
            u.last_name,
            u.phone_number or "",
            (getattr(u, "created_at", None).isoformat() if getattr(u, "created_at", None) else ""),
            int(paid_count or 0),
            int(completed_count or 0),
        ])

    csv_data = output.getvalue()
    return Response(content=csv_data, media_type="text/csv", headers={
        "Content-Disposition": "attachment; filename=clients.csv",
        "Access-Control-Expose-Headers": "Content-Disposition",
    })


@router.post("/clients/{user_id}/activate")
def activate_client(user_id: int, current: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_active = True
    db.add(u)
    db.commit()
    db.refresh(u)
    _audit(db, current[1].id, "client", str(user_id), "activate", {"is_active": False}, {"is_active": True})
    return {"status": "ok"}


@router.post("/clients/{user_id}/deactivate")
def deactivate_client(user_id: int, current: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_active = False
    db.add(u)
    db.commit()
    db.refresh(u)
    _audit(db, current[1].id, "client", str(user_id), "deactivate", {"is_active": True}, {"is_active": False})
    return {"status": "ok"}


@router.post("/clients/{user_id}/impersonate")
def impersonate_client(user_id: int, current: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    """Generate a short-lived access token for acting as a specific client.

    Returns a JWT that can be used as a Bearer token against the public API.
    Admin UIs can present a copy-to-clipboard and/or open-frontend-with-token flow.
    """
    u = db.query(User).filter(User.id == user_id, User.user_type == models.UserType.CLIENT).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    # 10-minute token with an impersonation claim
    token = create_access_token({"sub": u.email, "impersonated_by_admin_id": current[1].id})
    return {"token": token, "user": {"id": str(u.id), "email": u.email}}


# ────────────────────────────────────────────────────────────────────────────────
# Users (lookup + purge for any role)

@router.get("/users/search")
def search_users(email: str, _: Tuple[User, AdminUser] = Depends(require_roles("support", "admin", "superadmin")), db: Session = Depends(get_db)):
    e = normalize_email(email)
    u = db.query(User).filter(func.lower(User.email) == e).first()
    if not u:
        return {"exists": False}
    return {
        "exists": True,
        "user": {
            "id": str(u.id),
            "email": u.email,
            "user_type": str(u.user_type),
            "is_active": bool(u.is_active),
            "is_verified": bool(u.is_verified),
        },
    }


@router.post("/users/{user_id}/purge")
def purge_user(user_id: int, payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("superadmin")), db: Session = Depends(get_db)):
    """Purge any user (client or provider). Reuses provider purge logic but removes the role check."""
    confirm = str(payload.get("confirm") or "").strip().lower()
    force = bool(payload.get("force") or False)
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if confirm != (u.email or "").lower():
        raise HTTPException(status_code=400, detail="Confirmation does not match provider email")

    # Delegate to the same deletion routine by inlining the logic here (no role filter)
    # Active bookings check for artists only
    active_bookings = 0
    if u.user_type == models.UserType.SERVICE_PROVIDER:
        active_states = [
            models.BookingStatus.PENDING,
            models.BookingStatus.PENDING_QUOTE,
            models.BookingStatus.QUOTE_PROVIDED,
            models.BookingStatus.PENDING_ARTIST_CONFIRMATION,
            models.BookingStatus.CONFIRMED,
            models.BookingStatus.REQUEST_CONFIRMED,
        ]
        active_bookings = (
            db.query(models.Booking)
            .filter(models.Booking.artist_id == user_id)
            .filter(models.Booking.status.in_(active_states))
            .count()
        )
        if active_bookings and not force:
            raise HTTPException(status_code=400, detail="Provider has active bookings. Pass force=true to proceed.")

    # Reuse deletion sequence from purge_provider
    payload2 = {"confirm": confirm, "force": force}
    # Call the underlying function's core by simulating the same operations
    # Inlined to avoid circular imports or refactors
    # Precompute a summary for auditing
    try:
        svc_count = db.query(func.count(Service.id)).filter(Service.artist_id == user_id).scalar() or 0
    except Exception:
        svc_count = 0
    try:
        br_count = db.query(func.count(models.BookingRequest.id)).filter((models.BookingRequest.artist_id == user_id) | (models.BookingRequest.client_id == user_id)).scalar() or 0
    except Exception:
        br_count = 0
    msg_count = (
        db.query(func.count(models.Message.id))
        .join(models.BookingRequest, models.Message.booking_request_id == models.BookingRequest.id)
        .filter((models.BookingRequest.artist_id == user_id) | (models.BookingRequest.client_id == user_id))
        .scalar()
        or 0
    )
    before = {"email": u.email, "services": int(svc_count), "threads": int(br_count), "messages": int(msg_count), "active_bookings": int(active_bookings)}

    try:
        # Mirror the same DELETE sequence as provider purge
        db.execute(text("DELETE FROM invoices WHERE artist_id=:uid OR client_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM messages WHERE booking_request_id IN (SELECT id FROM booking_requests WHERE artist_id=:uid OR client_id=:uid)"), {"uid": user_id})
        db.execute(text("DELETE FROM messages WHERE sender_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM message_reactions WHERE user_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE booking_request_id IN (SELECT id FROM booking_requests WHERE artist_id=:uid OR client_id=:uid))"), {"uid": user_id})
        db.execute(text("DELETE FROM reviews WHERE artist_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM quotes_v2 WHERE artist_id=:uid OR client_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM quotes WHERE artist_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM bookings_simple WHERE artist_id=:uid OR client_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM bookings WHERE artist_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM booking_requests WHERE artist_id=:uid OR client_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM services WHERE artist_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM notifications WHERE user_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM email_tokens WHERE user_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM admin_users WHERE user_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM webauthn_credentials WHERE user_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM calendar_accounts WHERE user_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM quote_templates WHERE artist_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM profile_views WHERE artist_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM profile_views WHERE viewer_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM email_events WHERE user_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM sms_events WHERE user_id=:uid"), {"uid": user_id})
        db.execute(text("DELETE FROM service_provider_profiles WHERE user_id=:uid"), {"uid": user_id})
        # Final user delete
        db.execute(text("DELETE FROM users WHERE id=:uid"), {"uid": user_id})
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Purge failed: {exc}")

    _audit(db, current[1].id, "user", str(user_id), "purge", before, None)
    return {"purged": True, "summary": before}


@router.post("/providers/{user_id}/deactivate")
def deactivate_provider(user_id: int, current: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id, User.user_type == models.UserType.SERVICE_PROVIDER).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    before = {"is_active": bool(u.is_active)}
    try:
        u.is_active = False
        db.add(u)
    
        db.commit()
        db.refresh(u)
        after = {"is_active": bool(u.is_active)}
        _audit(db, current[1].id, "provider", str(user_id), "deactivate", before, after)
        return provider_to_admin(u, db.query(ServiceProviderProfile).filter(ServiceProviderProfile.user_id == user_id).first(), db.query(func.count(Service.id)).filter(Service.artist_id == user_id).scalar() or 0)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed")


@router.post("/providers/{user_id}/activate")
def activate_provider(user_id: int, current: Tuple[User, AdminUser] = Depends(require_roles("admin", "superadmin")), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id, User.user_type == models.UserType.SERVICE_PROVIDER).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    before = {"is_active": bool(u.is_active)}
    try:
        u.is_active = True
        db.add(u)
        db.commit()
        db.refresh(u)
        after = {"is_active": bool(u.is_active)}
        _audit(db, current[1].id, "provider", str(user_id), "activate", before, after)
        return provider_to_admin(u, db.query(ServiceProviderProfile).filter(ServiceProviderProfile.user_id == user_id).first(), db.query(func.count(Service.id)).filter(Service.artist_id == user_id).scalar() or 0)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed")


@router.post("/providers/{user_id}/message")
def message_provider(user_id: int, payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("support", "admin", "superadmin")), db: Session = Depends(get_db)):
    content = str(payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content required")
    artist_user = db.query(User).filter(User.id == user_id, User.user_type == models.UserType.SERVICE_PROVIDER).first()
    if not artist_user:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Find or create a thread with the Booka system user
    system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
    system_user = db.query(User).filter(func.lower(User.email) == system_email).first()
    if not system_user:
        try:
            system_user = User(
                email=system_email,
                password="!disabled-system-user!",
                first_name="Booka",
                last_name="Support",
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
    # Try to reuse an existing booking request thread; create one if missing
    br = (
        db.query(models.BookingRequest)
        .filter(models.BookingRequest.artist_id == user_id)
        .order_by(models.BookingRequest.created_at.desc())
        .first()
    )
    if not br and system_user:
        try:
            br = models.BookingRequest(
                client_id=system_user.id,
                artist_id=user_id,
                status=models.BookingStatus.PENDING_QUOTE,
            )
            db.add(br)
            db.commit()
            db.refresh(br)
        except Exception:
            db.rollback()
            br = None

    if not br:
        raise HTTPException(status_code=400, detail="Could not open a support thread")

    msg = crud.crud_message.create_message(
        db,
        booking_request_id=br.id,
        sender_id=system_user.id if system_user else br.artist_id,
        sender_type=models.SenderType.CLIENT,
        content=content,
        message_type=models.MessageType.SYSTEM,
        visible_to=models.VisibleTo.BOTH,
        system_key=f"admin_support_v1:{user_id}:{datetime.utcnow().isoformat()}",
    )
    try:
        notify_user_new_message(db, user=artist_user, sender=(system_user or artist_user), booking_request_id=br.id, content=content, message_type=models.MessageType.SYSTEM)
    except Exception:
        pass
    _audit(db, current[1].id, "provider", str(user_id), "support_message", None, {"booking_request_id": br.id, "message_id": msg.id})
    return {"status": "sent", "booking_request_id": str(br.id), "message_id": str(msg.id)}


@router.get("/providers/{user_id}/thread")
def get_provider_thread(user_id: int, _: Tuple[User, AdminUser] = Depends(require_roles("support", "admin", "superadmin")), db: Session = Depends(get_db)):
    """Return the latest support thread with a provider and recent messages."""
    # Find (or lazily create) a thread between Booka system user and the provider
    system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
    system_user = db.query(User).filter(func.lower(User.email) == system_email).first()
    if not system_user:
        system_user = User(
            email=system_email,
            password="!disabled-system-user!",
            first_name="Booka",
            last_name="Support",
            is_active=True,
            is_verified=True,
            user_type=models.UserType.CLIENT,
        )
        db.add(system_user)
        db.commit()
        db.refresh(system_user)

    br = (
        db.query(models.BookingRequest)
        .filter(models.BookingRequest.artist_id == user_id)
        .order_by(models.BookingRequest.created_at.desc())
        .first()
    )
    if not br:
        # Create empty thread for support if none exists
        br = models.BookingRequest(
            client_id=system_user.id,
            artist_id=user_id,
            status=models.BookingStatus.PENDING_QUOTE,
        )
        db.add(br)
        db.commit()
        db.refresh(br)

    # Fetch recent messages
    msgs = (
        db.query(models.Message)
        .filter(models.Message.booking_request_id == br.id)
        .order_by(models.Message.created_at.desc())
        .limit(50)
        .all()
    )
    items = [
        {
            "id": str(m.id),
            "sender_id": str(m.sender_id) if getattr(m, "sender_id", None) is not None else None,
            "sender_type": str(getattr(m, "sender_type", "") or ""),
            "content": getattr(m, "content", ""),
            "created_at": (getattr(m, "created_at", None).isoformat() if getattr(m, "created_at", None) else None),
            "message_type": str(getattr(m, "message_type", "") or ""),
        }
        for m in reversed(msgs)
    ]
    return {"booking_request_id": str(br.id), "messages": items}


@router.post("/providers/{user_id}/unlist")
def unlist_provider_services(user_id: int, current: Tuple[User, AdminUser] = Depends(require_roles("content", "admin", "superadmin")), db: Session = Depends(get_db)):
    """Mark all services for a provider as rejected (hidden)."""
    svcs = db.query(Service).filter(Service.artist_id == user_id).all()
    updated = 0
    before_states: List[Dict[str, Any]] = []
    for s in svcs:
        before_states.append({"id": s.id, "status": getattr(s, "status", None)})
        try:
            setattr(s, "status", "rejected")
            db.add(s)
            updated += 1
        except Exception:
            continue
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Unlist failed")
    _audit(db, current[1].id, "provider", str(user_id), "unlist_all", before_states, {"updated": updated})
    return {"status": "ok", "updated": updated}


@router.post("/providers/{user_id}/purge")
def purge_provider(user_id: int, payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("superadmin")), db: Session = Depends(get_db)):
    """Hard-delete a provider and cascade related records where supported.

    Safeguards:
    - Requires role superadmin.
    - Requires confirm matching the provider email.
    - If active bookings exist, requires force=true.
    """
    confirm = str(payload.get("confirm") or "").strip().lower()
    force = bool(payload.get("force") or False)
    u = db.query(User).filter(User.id == user_id, User.user_type == models.UserType.SERVICE_PROVIDER).first()
    if not u:
        raise HTTPException(status_code=404, detail="Provider not found")
    if confirm != (u.email or "").lower():
        raise HTTPException(status_code=400, detail="Confirmation does not match provider email")

    # Check for any bookings not completed/cancelled
    # Treat these statuses as active; they block purge unless force=true
    active_states = [
        models.BookingStatus.PENDING,
        models.BookingStatus.PENDING_QUOTE,
        models.BookingStatus.QUOTE_PROVIDED,
        models.BookingStatus.PENDING_ARTIST_CONFIRMATION,
        models.BookingStatus.CONFIRMED,
        models.BookingStatus.REQUEST_CONFIRMED,
    ]
    active_bookings = (
        db.query(models.Booking)
        .filter(models.Booking.artist_id == user_id)
        .filter(models.Booking.status.in_(active_states))
        .count()
    )
    if active_bookings and not force:
        raise HTTPException(status_code=400, detail="Provider has active bookings. Pass force=true to proceed.")

    # Precompute a summary for auditing
    svc_count = db.query(func.count(Service.id)).filter(Service.artist_id == user_id).scalar() or 0
    br_count = db.query(func.count(models.BookingRequest.id)).filter(models.BookingRequest.artist_id == user_id).scalar() or 0
    msg_count = (
        db.query(func.count(models.Message.id))
        .join(models.BookingRequest, models.Message.booking_request_id == models.BookingRequest.id)
        .filter(models.BookingRequest.artist_id == user_id)
        .scalar()
        or 0
    )
    before = {
        "email": u.email,
        "services": int(svc_count),
        "threads": int(br_count),
        "messages": int(msg_count),
        "active_bookings": int(active_bookings),
    }
    # Best-effort cascading deletes for dependent resources that may not have DB-level cascades
    try:
        # Invoices issued by this provider
        try:
            db.execute(text("DELETE FROM invoices WHERE artist_id=:uid OR client_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Messages under threads owned by this provider will be deleted with booking_requests below (ORM cascade). As a safety, force-delete via SQL too.
        try:
            db.execute(text(
                "DELETE FROM messages WHERE booking_request_id IN (SELECT id FROM booking_requests WHERE artist_id=:uid)"
            ), {"uid": user_id})
        except Exception:
            db.rollback()
        # Messages sent by this user anywhere
        try:
            db.execute(text("DELETE FROM messages WHERE sender_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Message reactions by this user or on their thread messages
        try:
            db.execute(text("DELETE FROM message_reactions WHERE user_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        try:
            db.execute(text(
                "DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE booking_request_id IN (SELECT id FROM booking_requests WHERE artist_id=:uid))"
            ), {"uid": user_id})
        except Exception:
            db.rollback()
        # Reviews for this artist (delete before bookings to avoid FK issues)
        try:
            db.execute(text("DELETE FROM reviews WHERE artist_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Quotes (v2) owned by this provider or on their threads; also quotes created for this client
        try:
            db.execute(text("DELETE FROM quotes_v2 WHERE artist_id=:uid OR client_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Legacy quotes table if present
        try:
            db.execute(text("DELETE FROM quotes WHERE artist_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # BookingSimple rows
        try:
            db.execute(text("DELETE FROM bookings_simple WHERE artist_id=:uid OR client_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Bookings (FK via service_provider_profiles.user_id)
        try:
            db.execute(text("DELETE FROM bookings WHERE artist_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Booking requests (threads) where artist or client is this user
        try:
            db.execute(text("DELETE FROM booking_requests WHERE artist_id=:uid OR client_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Services
        try:
            db.execute(text("DELETE FROM services WHERE artist_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Notification events
        try:
            db.execute(text("DELETE FROM notifications WHERE user_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Email confirmation tokens
        try:
            db.execute(text("DELETE FROM email_tokens WHERE user_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Admin user mapping
        try:
            db.execute(text("DELETE FROM admin_users WHERE user_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # WebAuthn credentials
        try:
            db.execute(text("DELETE FROM webauthn_credentials WHERE user_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Calendar accounts
        try:
            db.execute(text("DELETE FROM calendar_accounts WHERE user_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Quote templates
        try:
            db.execute(text("DELETE FROM quote_templates WHERE artist_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Profile views
        try:
            db.execute(text("DELETE FROM profile_views WHERE artist_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        try:
            db.execute(text("DELETE FROM profile_views WHERE viewer_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Email/SMS event rows (best-effort; no FKs)
        try:
            db.execute(text("DELETE FROM email_events WHERE user_id=:uid"), {"uid": user_id})
            db.execute(text("DELETE FROM sms_events WHERE user_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()
        # Service provider profile
        try:
            db.execute(text("DELETE FROM service_provider_profiles WHERE user_id=:uid"), {"uid": user_id})
        except Exception:
            db.rollback()

        # Finally, delete the user via raw SQL to avoid ORM trying to NULL FKs
        db.execute(text("DELETE FROM users WHERE id=:uid"), {"uid": user_id})
        db.commit()
    except Exception as exc:
        db.rollback()
        # Surface the underlying error to aid debugging from the admin UI
        raise HTTPException(status_code=400, detail=f"Purge failed: {exc}")
    _audit(db, current[1].id, "provider", str(user_id), "purge", before, None)
    return {"purged": True, "summary": before}


# ────────────────────────────────────────────────────────────────────────────────
# Conversations (Support Inbox)

@router.get("/conversations")
def list_conversations(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("support", "admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    # Identify system user
    system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
    system_user = db.query(User).filter(func.lower(User.email) == system_email).first()
    system_id = system_user.id if system_user else None

    # Fetch threads where system user is client or have system messages
    q = (
        db.query(models.BookingRequest.id, models.BookingRequest.artist_id)
        .filter(
            (models.BookingRequest.client_id == system_id)
            | (
                db.query(models.Message.id)
                .filter(models.Message.booking_request_id == models.BookingRequest.id)
                .filter(models.Message.message_type == models.MessageType.SYSTEM)
                .exists()
            )
        )
    )
    # Apply simple search on provider email/name
    filters = _parse_json_param(request.query_params, "filter") or {}
    qtext = filters.get("q") if isinstance(filters, dict) else None
    if qtext:
        ilike = f"%{qtext}%"
        q = q.join(User, User.id == models.BookingRequest.artist_id).filter(
            (func.lower(User.email).ilike(ilike))
            | (func.lower(User.first_name).ilike(ilike))
            | (func.lower(User.last_name).ilike(ilike))
        )

    total = q.count()
    threads = q.offset(offset).limit(limit).all()

    items: List[Dict[str, Any]] = []
    for tid, artist_id in threads:
        u = db.query(User).get(artist_id)
        last = (
            db.query(models.Message)
            .filter(models.Message.booking_request_id == tid)
            .order_by(models.Message.created_at.desc())
            .first()
        )
        items.append(
            {
                "id": str(tid),
                "provider_id": str(artist_id),
                "provider_email": getattr(u, "email", None),
                "provider_name": f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip(),
                "last_message": getattr(last, "content", None),
                "last_at": (getattr(last, "created_at", None).isoformat() if getattr(last, "created_at", None) else None),
            }
        )
    # Sort by last_at desc at the application layer for consistency
    items.sort(key=lambda x: x.get("last_at") or "", reverse=True)
    return _with_total(items, total, "conversations", start, start + len(items) - 1)


@router.get("/conversations/{thread_id}")
def get_conversation(thread_id: int, _: Tuple[User, AdminUser] = Depends(require_roles("support", "admin", "superadmin")), db: Session = Depends(get_db)):
    br = db.query(models.BookingRequest).filter(models.BookingRequest.id == thread_id).first()
    if not br:
        raise HTTPException(status_code=404, detail="Not found")
    msgs = (
        db.query(models.Message)
        .filter(models.Message.booking_request_id == thread_id)
        .order_by(models.Message.created_at.asc())
        .all()
    )
    out = [
        {
            "id": str(m.id),
            "sender_id": str(m.sender_id) if getattr(m, "sender_id", None) is not None else None,
            "sender_type": str(getattr(m, "sender_type", "") or ""),
            "content": getattr(m, "content", ""),
            "created_at": (getattr(m, "created_at", None).isoformat() if getattr(m, "created_at", None) else None),
            "message_type": str(getattr(m, "message_type", "") or ""),
        }
        for m in msgs
    ]
    return {"id": str(thread_id), "messages": out}


@router.post("/conversations/{thread_id}/message")
def reply_conversation(thread_id: int, payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("support", "admin", "superadmin")), db: Session = Depends(get_db)):
    br = db.query(models.BookingRequest).filter(models.BookingRequest.id == thread_id).first()
    if not br:
        raise HTTPException(status_code=404, detail="Not found")
    content = str(payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content required")
    system_email = (os.getenv("BOOKA_SYSTEM_EMAIL") or "system@booka.co.za").strip().lower()
    system_user = db.query(User).filter(func.lower(User.email) == system_email).first()
    if not system_user:
        system_user = User(
            email=system_email,
            password="!disabled-system-user!",
            first_name="Booka",
            last_name="Support",
            is_active=True,
            is_verified=True,
            user_type=models.UserType.CLIENT,
        )
        db.add(system_user)
        db.commit()
        db.refresh(system_user)
    msg = crud.crud_message.create_message(
        db,
        booking_request_id=thread_id,
        sender_id=system_user.id,
        sender_type=models.SenderType.CLIENT,
        content=content,
        message_type=models.MessageType.SYSTEM,
        visible_to=models.VisibleTo.BOTH,
        system_key=f"admin_support_v1:{thread_id}:{datetime.utcnow().isoformat()}",
    )
    try:
        artist_user = db.query(User).filter(User.id == br.artist_id).first()
        if artist_user:
            notify_user_new_message(db, user=artist_user, sender=system_user, booking_request_id=thread_id, content=content, message_type=models.MessageType.SYSTEM)
    except Exception:
        pass
    _audit(db, current[1].id, "conversation", str(thread_id), "reply", None, {"message_id": msg.id})
    return {"status": "sent", "message_id": str(msg.id)}

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
    data = booking_to_admin(b)
    # Best-effort: include simple_id for UI payout worksheet
    try:
        bs = None
        if getattr(b, 'quote_id', None) is not None:
            from ..models import BookingSimple as _BS  # type: ignore
            bs = db.query(_BS).filter(_BS.quote_id == b.quote_id).first()
        if bs:
            data['simple_id'] = str(getattr(bs, 'id', '')) or None
    except Exception:
        pass
    return data


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
        # Use a dedicated Booka→Artist system thread; never reuse client threads
        br = (
            db.query(models.BookingRequest)
            .filter(models.BookingRequest.artist_id == s.artist_id)
            .filter(models.BookingRequest.client_id == (system_user.id if system_user else -1))
            .order_by(models.BookingRequest.created_at.desc())
            .first()
        )
        if not br and system_user:
            # Create a lightweight system thread so the artist sees Booka updates in Inbox
            br = models.BookingRequest(
                client_id=system_user.id,
                artist_id=s.artist_id,
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
            m = crud.crud_message.create_message(
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
            .filter(models.BookingRequest.client_id == (system_user.id if system_user else -1))
            .order_by(models.BookingRequest.created_at.desc())
            .first()
        )
        if not br and system_user:
            br = models.BookingRequest(
                client_id=system_user.id,
                artist_id=s.artist_id,
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
            m = crud.crud_message.create_message(
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
                    .filter(models.BookingRequest.client_id == (system_user.id if system_user else -1))
                    .order_by(models.BookingRequest.created_at.desc())
                    .first()
                )
                if not br and system_user:
                    br = models.BookingRequest(
                        client_id=system_user.id,
                        artist_id=s.artist_id,
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
                    m = crud.crud_message.create_message(
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
                    .filter(models.BookingRequest.client_id == (system_user.id if system_user else -1))
                    .order_by(models.BookingRequest.created_at.desc())
                    .first()
                )
                if not br and system_user:
                    br = models.BookingRequest(
                        client_id=system_user.id,
                        artist_id=s.artist_id,
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
                    m = crud.crud_message.create_message(
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


@router.post("/admin_users")
def create_admin_user(payload: Dict[str, Any], _: Tuple[User, AdminUser] = Depends(require_roles("superadmin")), db: Session = Depends(get_db)):
    """Create an admin mapping for an existing user by email (superadmin only)."""
    email = normalize_email(payload.get("email") or "")
    role = (payload.get("role") or "admin").strip()
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    if role not in {"support", "payments", "trust", "content", "admin", "superadmin"}:
        raise HTTPException(status_code=400, detail="invalid role")
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = db.query(AdminUser).filter(AdminUser.user_id == user.id).first()
    if existing:
        # Update role if already exists
        existing.role = role
        db.commit()
        db.refresh(existing)
        return {"id": str(existing.id), "email": existing.email, "role": existing.role, "created_at": (existing.created_at.isoformat() if existing.created_at else None)}
    a = AdminUser(user_id=user.id, email=user.email, role=role)
    db.add(a)
    db.commit()
    db.refresh(a)
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


@router.delete("/admin_users/{admin_id}")
def delete_admin_user(admin_id: int, _: Tuple[User, AdminUser] = Depends(require_roles("superadmin")), db: Session = Depends(get_db)):
    a = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    before = {"email": a.email, "role": a.role}
    try:
        db.delete(a)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Delete failed")
    _audit(db, _[1].id, "admin_user", str(admin_id), "delete", before, None)
    return {"status": "deleted"}


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
    def _iso(dt):
        try:
            return dt.isoformat() if dt is not None else None
        except Exception:
            return None
    items = [{
        "id": str(r[0]),
        "booking_id": (str(r[1]) if r[1] is not None else None),
        "type": r[2],
        "amount": float(r[3] or 0),
        "currency": r[4],
        "created_at": _iso(r[5]),
        "meta": r[6],
    } for r in rows]
    return _with_total(items, int(total), "ledger", start, start + len(items) - 1)


@router.get("/payouts")
def list_payouts(request: Request, _: Tuple[User, AdminUser] = Depends(require_roles("payments", "admin", "superadmin")), db: Session = Depends(get_db)):
    offset, limit, start, end = _get_offset_limit(request.query_params)
    filters = _parse_json_param(request.query_params, 'filter') or {}
    where = []
    params: Dict[str, Any] = {"lim": limit, "off": offset}
    if isinstance(filters, dict):
        if filters.get('booking_id'):
            where.append("booking_id = :bid")
            params['bid'] = filters['booking_id']
        if filters.get('provider_id'):
            where.append("provider_id = :pid")
            params['pid'] = filters['provider_id']
        if filters.get('status'):
            where.append("status = :st")
            params['st'] = filters['status']
        if filters.get('type'):
            where.append("type = :tp")
            params['tp'] = filters['type']
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db.execute(text(f"""
        SELECT id, booking_id, provider_id, amount, currency, status, type, scheduled_at, paid_at, method, reference, batch_id, created_at, meta
        FROM payouts
        {where_sql}
        ORDER BY created_at DESC
        LIMIT :lim OFFSET :off
    """), params).fetchall()
    total = db.execute(text(f"SELECT COUNT(*) FROM payouts {where_sql}"), {k:v for k,v in params.items() if k in ('bid','pid','st','tp')}).scalar() or 0
    def _iso(dt):
        try:
            return dt.isoformat() if dt is not None else None
        except Exception:
            return None
    items = [{
        "id": str(r[0]),
        "booking_id": str(r[1]) if r[1] is not None else None,
        "provider_id": str(r[2]) if r[2] is not None else None,
        "amount": float(r[3] or 0),
        "currency": r[4] or "ZAR",
        "status": r[5] or "queued",
        "type": r[6],
        "scheduled_at": _iso(r[7]),
        "paid_at": _iso(r[8]),
        "method": r[9],
        "reference": r[10],
        "batch_id": r[11],
        "created_at": _iso(r[12]),
        "meta": r[13],
    } for r in rows]
    return _with_total(items, int(total), "payouts", start, start + len(items) - 1)


@router.get("/payouts/{payout_id}/pdf-url")
def get_payout_pdf_url(
    payout_id: int,
    current: Tuple[User, AdminUser] = Depends(require_roles("payments", "admin", "superadmin")),
    db: Session = Depends(get_db),
):
    """Return a presigned, headerless URL to the remittance PDF for Admin UI.

    - Generates the PDF if needed.
    - Uploads to R2 and returns a presigned GET so the browser can open it
      without attaching Authorization headers.
    """
    try:
        from ..services import remittance_pdf  # type: ignore
        from ..utils import r2 as r2utils  # type: ignore
    except Exception:
        raise HTTPException(status_code=500, detail="PDF service unavailable")

    # Generate PDF bytes (in-memory) and upload to R2
    try:
        data = remittance_pdf.generate_pdf(db, int(payout_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Remittance not available")

    try:
        key = r2utils.build_remittance_key(str(payout_id))
        r2utils.put_bytes(key, data, content_type="application/pdf")
        signed = r2utils.presign_get_by_key(
            key,
            filename=f"remittance_{payout_id}.pdf",
            content_type="application/pdf",
            inline=True,
        )
        return {"url": signed}
    except Exception:
        # Fallback: no presigned URL available
        raise HTTPException(status_code=503, detail="presign_failed")


@router.post("/payout_batches")
def create_payout_batch(payload: Dict[str, Any], current: Tuple[User, AdminUser] = Depends(require_roles("payments", "admin", "superadmin")), db: Session = Depends(get_db)):
    booking_ids = payload.get("bookingIds") or []
    if not isinstance(booking_ids, list) or not booking_ids:
        raise HTTPException(status_code=400, detail="bookingIds required")
    import uuid, json
    batch_id = f"pb_{uuid.uuid4().hex[:10]}"
    # Naive computation: 80% to provider if charged_total_amount exists else 0 (legacy stub)
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


@router.post("/payouts/{payout_id}/mark-paid")
def mark_payout_paid(
    payout_id: int,
    payload: Dict[str, Any],
    current: Tuple[User, AdminUser] = Depends(require_roles("payments", "admin", "superadmin")),
    db: Session = Depends(get_db),
):
    """Mark a payout as paid (manual disbursement).

    Sets status=paid, paid_at=now, and records method/reference when provided.
    Also appends a ledger entry provider_payout_out for reconciliation.
    """
    method = (payload.get("method") or "manual").strip()
    reference = (payload.get("reference") or "").strip()
    # Fetch row
    row = db.execute(text("SELECT booking_id, amount, currency, status FROM payouts WHERE id=:id"), {"id": payout_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Payout not found")
    booking_id = int(row[0]) if row[0] is not None else None
    amount = float(row[1] or 0)
    currency = row[2] or "ZAR"
    status_cur = (row[3] or "").lower()
    if status_cur == "paid":
        return {"status": "already_paid"}
    # Update payout
    try:
        db.execute(
            text("UPDATE payouts SET status='paid', paid_at=:ts, method=:m, reference=:r WHERE id=:id"),
            {"ts": datetime.utcnow(), "m": method, "r": reference, "id": payout_id},
        )
        # Ledger entry (best-effort)
        if booking_id is not None:
            try:
                db.execute(
                    text("INSERT INTO ledger_entries (booking_id, type, amount, currency, meta) VALUES (:bid, 'provider_payout_out', :amt, :cur, :meta)"),
                    {"bid": booking_id, "amt": amount, "cur": currency, "meta": json.dumps({"method": method, "reference": reference})},
                )
            except Exception:
                pass
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed")
    # Audit
    _audit(db, current[1].id, "payout", str(payout_id), "mark_paid", {"method": method, "reference": reference}, {"status": "paid"})
    return {"status": "paid", "payout_id": str(payout_id)}


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
@router.get("/audit_events")
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
