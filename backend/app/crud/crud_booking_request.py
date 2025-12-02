from sqlalchemy.orm import Session, joinedload, selectinload
import re
from sqlalchemy import select, func
from typing import Dict, List, Optional

from .. import models
from .. import schemas
from . import crud_message
from ..utils.messages import preview_label_for_message
from ..utils.messages import BOOKING_DETAILS_PREFIX

# --- BookingRequest CRUD ---_REQUEST

def create_booking_request(
    db: Session,
    booking_request: schemas.BookingRequestCreate,
    client_id: int
) -> models.BookingRequest:
    db_booking_request = models.BookingRequest(
        **booking_request.model_dump(exclude={"status"}),
        client_id=client_id,
        status=booking_request.status or models.BookingStatus.PENDING_QUOTE,
    )
    db.add(db_booking_request)
    return db_booking_request

def get_booking_request(db: Session, request_id: int) -> Optional[models.BookingRequest]:
    db_request = (
        db.query(models.BookingRequest)
        .options(
            joinedload(models.BookingRequest.client),
            joinedload(models.BookingRequest.artist).joinedload(models.User.artist_profile),
            joinedload(models.BookingRequest.service).joinedload(models.Service.artist),
        )
        .filter(models.BookingRequest.id == request_id)
        .first()
    )

    if db_request and db_request.artist and db_request.artist.artist_profile:
        # Canonical provider profile attached for responses
        setattr(db_request, "artist_profile", db_request.artist.artist_profile)
        # Alias for clients expecting `service_provider_profile`
        setattr(db_request, "service_provider_profile", db_request.artist.artist_profile)
    if db_request:
        try:
            accepted = (
                db.query(models.QuoteV2.id)
                .filter(models.QuoteV2.booking_request_id == db_request.id)
                .filter(models.QuoteV2.status == models.QuoteStatusV2.ACCEPTED)
                .order_by(models.QuoteV2.id.desc())
                .first()
            )
            if accepted and accepted[0]:
                setattr(db_request, "accepted_quote_id", int(accepted[0]))
        except Exception:
            pass
    return db_request

def get_booking_requests_by_client(db: Session, client_id: int, skip: int = 0, limit: int = 100) -> List[models.BookingRequest]:
    rows = (
        db.query(models.BookingRequest)
        .options(
            joinedload(models.BookingRequest.client),
            joinedload(models.BookingRequest.artist).joinedload(models.User.artist_profile),
            joinedload(models.BookingRequest.service).joinedload(models.Service.artist),
        )
        .filter(models.BookingRequest.client_id == client_id)
        .order_by(models.BookingRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    request_ids = [br.id for br in rows]
    accepted_map: dict[int, int] = {}
    if request_ids:
        try:
            accepted_rows = (
                db.query(models.QuoteV2.booking_request_id, models.QuoteV2.id)
                .filter(models.QuoteV2.booking_request_id.in_(request_ids))
                .filter(models.QuoteV2.status == models.QuoteStatusV2.ACCEPTED)
                .all()
            )
            accepted_map = {int(r.booking_request_id): int(r.id) for r in accepted_rows}
        except Exception:
            accepted_map = {}
    for br in rows:
        if br.artist and br.artist.artist_profile:
            setattr(br, "artist_profile", br.artist.artist_profile)
            setattr(br, "service_provider_profile", br.artist.artist_profile)
            setattr(br, "service_provider_profile", br.artist.artist_profile)
        if br.id in accepted_map:
            setattr(br, "accepted_quote_id", accepted_map[br.id])
    return rows

def get_booking_requests_by_artist(db: Session, artist_id: int, skip: int = 0, limit: int = 100) -> List[models.BookingRequest]:
    rows = (
        db.query(models.BookingRequest)
        .options(
            joinedload(models.BookingRequest.client),
            joinedload(models.BookingRequest.artist).joinedload(models.User.artist_profile),
            joinedload(models.BookingRequest.service).joinedload(models.Service.artist),
        )
        .filter(models.BookingRequest.artist_id == artist_id)
        .order_by(models.BookingRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    request_ids = [br.id for br in rows]
    accepted_map: dict[int, int] = {}
    if request_ids:
        try:
            accepted_rows = (
                db.query(models.QuoteV2.booking_request_id, models.QuoteV2.id)
                .filter(models.QuoteV2.booking_request_id.in_(request_ids))
                .filter(models.QuoteV2.status == models.QuoteStatusV2.ACCEPTED)
                .all()
            )
            accepted_map = {int(r.booking_request_id): int(r.id) for r in accepted_rows}
        except Exception:
            accepted_map = {}
    for br in rows:
        if br.artist and br.artist.artist_profile:
            setattr(br, "artist_profile", br.artist.artist_profile)
            setattr(br, "service_provider_profile", br.artist.artist_profile)
        if br.id in accepted_map:
            setattr(br, "accepted_quote_id", accepted_map[br.id])
    return rows

def update_booking_request(
    db: Session, 
    db_booking_request: models.BookingRequest,
    request_update: schemas.BookingRequestUpdateByClient | schemas.BookingRequestUpdateByArtist
) -> models.BookingRequest:
    update_data = request_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_booking_request, key, value)
    return db_booking_request

# Potentially a delete function if needed, though usually requests are archived or status changed
# def delete_booking_request(db: Session, request_id: int):
#     db_booking_request = db.query(models.BookingRequest).filter(models.BookingRequest.id == request_id).first()
#     if db_booking_request:
#         db.delete(db_booking_request)
#         db.commit()
#     return db_booking_request


def get_booking_requests_with_last_message(
    db: Session,
    *,
    client_id: int | None = None,
    artist_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
    include_relationships: bool = True,
    viewer: models.VisibleTo | None = None,
    per_request_messages: int = 6,
) -> List[models.BookingRequest]:
    """Return booking requests with their latest chat message.

    This helper eager loads related client, artist, service and quotes models and
    attaches ``last_message_content`` and ``last_message_timestamp`` attributes to
    each ``BookingRequest`` instance without triggering N+1 queries.
    """

    if client_id is None and artist_id is None:
        raise ValueError("client_id or artist_id must be provided")

    latest_msg_window = (
        select(
            models.Message.booking_request_id.label("br_id"),
            models.Message.timestamp.label("last_message_timestamp"),
            func.row_number()
            .over(
                partition_by=models.Message.booking_request_id,
                order_by=models.Message.timestamp.desc(),
            )
            .label("rn"),
        )
    ).subquery()

    latest_msg = (
        select(
            latest_msg_window.c.br_id,
            latest_msg_window.c.last_message_timestamp,
        )
        .where(latest_msg_window.c.rn == 1)
        .subquery()
    )

    query = db.query(models.BookingRequest)

    if include_relationships:
        query = query.options(
            selectinload(models.BookingRequest.client).load_only(
                models.User.id,
                models.User.first_name,
                models.User.last_name,
                models.User.profile_picture_url,
                models.User.email,
                models.User.phone_number,
                models.User.user_type,
                models.User.is_active,
                models.User.is_verified,
                models.User.mfa_enabled,
            ),
            selectinload(models.BookingRequest.artist)
            .load_only(
                models.User.id,
                models.User.first_name,
                models.User.last_name,
                models.User.profile_picture_url,
                models.User.email,
                models.User.phone_number,
                models.User.user_type,
                models.User.is_active,
                models.User.is_verified,
                models.User.mfa_enabled,
            )
            .selectinload(models.User.artist_profile)
            .load_only(
                models.ServiceProviderProfile.user_id,
                models.ServiceProviderProfile.business_name,
                models.ServiceProviderProfile.profile_picture_url,
                models.ServiceProviderProfile.cancellation_policy,
                models.ServiceProviderProfile.created_at,
                models.ServiceProviderProfile.updated_at,
            ),
            selectinload(models.BookingRequest.service).load_only(
                models.Service.id,
                models.Service.service_type,
                models.Service.title,
                models.Service.price,
                models.Service.details,
                models.Service.media_url,
                models.Service.duration_minutes,
                models.Service.currency,
                models.Service.display_order,
            ),
        )
    else:
            query = query.options(
                selectinload(models.BookingRequest.client).load_only(
                    models.User.id,
                    models.User.first_name,
                    models.User.last_name,
                    models.User.profile_picture_url,
                    models.User.email,
                    models.User.phone_number,
                    models.User.user_type,
                    models.User.is_active,
                    models.User.is_verified,
                    models.User.mfa_enabled,
                ),
                selectinload(models.BookingRequest.artist)
                .load_only(
                    models.User.id,
                    models.User.first_name,
                    models.User.last_name,
                    models.User.profile_picture_url,
                    models.User.email,
                    models.User.phone_number,
                    models.User.user_type,
                    models.User.is_active,
                    models.User.is_verified,
                    models.User.mfa_enabled,
                )
                .selectinload(models.User.artist_profile)
                .load_only(
                    models.ServiceProviderProfile.user_id,
                    models.ServiceProviderProfile.business_name,
                    models.ServiceProviderProfile.profile_picture_url,
                    models.ServiceProviderProfile.cancellation_policy,
                    models.ServiceProviderProfile.created_at,
                    models.ServiceProviderProfile.updated_at,
                ),
                # For preview (include_relationships=False), keep service light but include title/type
                # so list views can show basic context without hydrating heavy relations.
                selectinload(models.BookingRequest.service).load_only(
                    models.Service.id,
                    models.Service.service_type,
                    models.Service.title,
                    models.Service.media_url,
                    models.Service.duration_minutes,
                    models.Service.price,
                    models.Service.currency,
                    models.Service.display_order,
                ),
            )

    query = query.outerjoin(latest_msg, models.BookingRequest.id == latest_msg.c.br_id).add_columns(
        latest_msg.c.last_message_timestamp
    )

    if client_id is not None:
        query = query.filter(models.BookingRequest.client_id == client_id)
    if artist_id is not None:
        query = query.filter(models.BookingRequest.artist_id == artist_id)

    rows = (
        query.order_by(
            func.coalesce(
                latest_msg.c.last_message_timestamp,
                models.BookingRequest.created_at,
            ).desc()
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    if not rows:
        return []

    requests: List[models.BookingRequest] = []
    for br, ts in rows:
        timestamp = ts or br.updated_at or br.created_at
        setattr(br, "last_message_timestamp", timestamp)
        requests.append(br)

    request_ids = [br.id for br in requests]
    recent_message_map: Dict[int, List[models.Message]] = crud_message.get_recent_messages_for_requests(
        db,
        request_ids,
        per_request=max(1, int(per_request_messages or 1)),
    )

    pv_ids = [
        br.id
        for br in requests
        if (getattr(br.service, "service_type", "") or "").lower() == "personalized video"
    ]
    paid_pv_ids = (
        crud_message.get_payment_received_booking_request_ids(db, pv_ids)
        if pv_ids
        else set()
    )

    accepted_quote_map: Dict[int, int] = {}
    if requests:
        try:
            accepted_rows = (
                db.query(models.QuoteV2.booking_request_id, models.QuoteV2.id)
                .filter(models.QuoteV2.booking_request_id.in_(request_ids))
                .filter(models.QuoteV2.status == models.QuoteStatusV2.ACCEPTED)
                .all()
            )
            accepted_quote_map = {int(r.booking_request_id): int(r.id) for r in accepted_rows}
        except Exception:
            accepted_quote_map = {}

    def _state_from_status(status: "models.BookingStatus") -> str:
        if status in [models.BookingStatus.DRAFT, models.BookingStatus.PENDING_QUOTE, models.BookingStatus.PENDING]:
            return "requested"
        if status in [models.BookingStatus.QUOTE_PROVIDED]:
            return "quoted"
        if status in [models.BookingStatus.CONFIRMED, models.BookingStatus.REQUEST_CONFIRMED]:
            return "confirmed"
        if status in [models.BookingStatus.COMPLETED, models.BookingStatus.REQUEST_COMPLETED]:
            return "completed"
        if status in [
            models.BookingStatus.CANCELLED,
            models.BookingStatus.REQUEST_DECLINED,
            models.BookingStatus.REQUEST_WITHDRAWN,
            models.BookingStatus.QUOTE_REJECTED,
        ]:
            return "cancelled"
        return "requested"

    filtered_results: List[models.BookingRequest] = []
    for br in requests:
        # Choose the newest message visible to the viewer (if provided)
        message_candidates = recent_message_map.get(br.id, [])
        if viewer is not None:
            try:
                vis_allowed = {models.VisibleTo.BOTH, viewer}
                message_candidates = [
                    m
                    for m in message_candidates
                    if getattr(m, "visible_to", models.VisibleTo.BOTH) in vis_allowed
                ]
            except Exception:
                # On any error, fall back to unfiltered candidates
                pass
        last_m = message_candidates[0] if message_candidates else None
        state = _state_from_status(br.status)

        sender_display = None
        if last_m and last_m.sender_id:
            if last_m.sender_id == br.artist_id and br.artist:
                if br.artist.artist_profile and br.artist.artist_profile.business_name:
                    sender_display = br.artist.artist_profile.business_name
                else:
                    sender_display = f"{br.artist.first_name} {br.artist.last_name}"
            elif last_m.sender_id == br.client_id and br.client:
                sender_display = f"{br.client.first_name} {br.client.last_name}"

        service_type = (getattr(br.service, "service_type", "") or "").lower()
        is_pv = service_type == "personalized video"
        if is_pv and br.id not in paid_pv_ids:
            continue

        # Prefer the first non-deleted candidate as the preview message so that
        # tombstones do not dominate list snippets when more recent real
        # messages exist.
        preview_message = None
        for cand in message_candidates:
            if not crud_message.is_deleted_message(cand):
                preview_message = cand
                break
        if preview_message is None:
            preview_message = last_m
        preview_key = None
        preview_args: Dict[str, int | str] = {}

        if is_pv:
            def _is_skip(msg: Optional[models.Message]) -> bool:
                if not msg or not getattr(msg, "content", None):
                    return False
                text = (msg.content or "").strip()
                low = text.lower()
                if text.startswith(BOOKING_DETAILS_PREFIX):
                    return True
                if "you have a new booking request" in low:
                    return True
                return False

            if _is_skip(preview_message):
                for candidate in message_candidates:
                    if not _is_skip(candidate):
                        preview_message = candidate
                        break

        if is_pv and preview_message is not None:
            text = (preview_message.content or "").strip()
            low = text.lower()
            if low.startswith("payment received"):
                m = re.search(r"order\s*#\s*([A-Za-z0-9\-]+)", text, flags=re.IGNORECASE)
                order = f" — order #{m.group(1)}" if m else ""
                preview = f"Payment received{order} · View receipt"
                preview_key = "payment_received"
            elif "brief completed" in low:
                preview = "Brief completed"
                preview_key = "brief_completed"
            else:
                preview = preview_label_for_message(preview_message, thread_state=state, sender_display=sender_display)
        else:
            preview = preview_label_for_message(preview_message, thread_state=state, sender_display=sender_display)

        meta_msg = preview_message or last_m
        if meta_msg and getattr(meta_msg, "system_key", None):
            sk = (meta_msg.system_key or "").strip().lower()
            if sk.startswith("booking_details"):
                preview_key = preview_key or "new_booking_request"
            elif sk.startswith("payment_received") or sk == "payment_received":
                preview_key = "payment_received"
            elif sk.startswith("event_reminder"):
                preview_key = "event_reminder"
                low = (meta_msg.content or "").strip().lower()
                dm = re.search(r"event\s+in\s+(\d+)\s+days\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", low, flags=re.IGNORECASE)
                if dm:
                    preview_args = {"daysBefore": int(dm.group(1)), "date": dm.group(2)}

        setattr(br, "last_message_content", preview or "")
        setattr(br, "_last_message", last_m)
        setattr(br, "_preview_message", preview_message or last_m)
        setattr(br, "_preview_key", preview_key)
        setattr(br, "_preview_args", preview_args or None)

        if br.artist and br.artist.artist_profile:
            setattr(br, "artist_profile", br.artist.artist_profile)
        if br.id in accepted_quote_map:
            setattr(br, "accepted_quote_id", accepted_quote_map[br.id])

        filtered_results.append(br)

    filtered_results.sort(
        key=lambda req: getattr(req, "last_message_timestamp", req.created_at),
        reverse=True,
    )

    return filtered_results
