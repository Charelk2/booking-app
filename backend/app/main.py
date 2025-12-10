# backend/app/main.py

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Iterable, Optional

from fastapi import FastAPI, Request, status
from sqlalchemy.exc import TimeoutError as SA_TimeoutError
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, ORJSONResponse
from fastapi.staticfiles import StaticFiles
from routes import distance
from starlette.exceptions import HTTPException as StarletteHTTPException
try:
    from starlette.middleware.sessions import SessionMiddleware  # type: ignore
    _HAS_SESSIONS = True
except Exception:  # pragma: no cover - optional for tooling environments
    SessionMiddleware = None  # type: ignore
    _HAS_SESSIONS = False
try:  # Optional: older Starlette may not include ProxyHeadersMiddleware
    from starlette.middleware.proxy_headers import ProxyHeadersMiddleware  # type: ignore
    _HAS_PROXY_HEADERS = True
except Exception:  # pragma: no cover
    ProxyHeadersMiddleware = None  # type: ignore
    _HAS_PROXY_HEADERS = False

from . import models

# Routers under app/api/
from .api import (
    api_booking,
    api_booking_request,
    api_message,
    api_notification,
    api_threads,
    api_payment,
    api_payout,
    api_quote_template,
    api_quote,
    api_rider,
    api_pricebook,
    api_sound_prefs,
    api_sound_estimate,
    api_ops,
    api_review,
    api_service,
    api_service_category,
    api_settings,
    api_sound_outreach,
    api_user,
    api_weather,
    api_ws,
    auth,
    api_magic,
    api_admin,
    api_webhooks_events,
    api_uploads,
    api_artist_alias,
    api_attachments,
    api_client_profile,
)

# The “service-provider-profiles” router lives under app/api/v1/
from .api.v1 import api_service_provider as api_service_provider_profiles
from .core.config import settings, FRONTEND_ORIGINS
from .core.observability import setup_logging, setup_tracer
from .crud import crud_quote
from .database import Base, SessionLocal, engine
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from .db_utils import (
    ensure_attachment_url_column,
    ensure_attachment_meta_column,
    ensure_booking_event_city_column,
    ensure_booking_request_travel_columns,
    ensure_booking_simple_columns,
    remove_deposit_columns_from_booking_simple,
    ensure_booking_artist_deadline_column,
    ensure_calendar_account_email_column,
    ensure_currency_column,
    ensure_custom_subtitle_column,
    ensure_display_order_column,
    ensure_legacy_artist_user_type,
    ensure_media_url_column,
    ensure_message_core_columns,
    ensure_message_action_column,
    ensure_message_expires_at_column,
    ensure_message_system_key_column,
    ensure_message_reply_to_column,
    ensure_message_reactions_table,
    ensure_message_is_read_column,
    ensure_message_type_column,
    normalize_message_type_values,
    ensure_mfa_columns,
    ensure_refresh_token_columns,
    ensure_notification_link_column,
    ensure_portfolio_image_urls_column,
    ensure_price_visible_column,
    ensure_request_attachment_column,
    ensure_sound_outreach_columns,
    ensure_service_category_id_column,
    ensure_service_travel_columns,
    ensure_service_type_column,
    ensure_service_status_column,
    ensure_service_core_columns,
    ensure_timestamp_columns,
    ensure_timestamp_defaults,
    ensure_enum_values,
    ensure_service_managed_markup_column,
    ensure_ledger_tables,
    ensure_payout_tables,
    ensure_dispute_table,
    ensure_email_sms_event_tables,
    ensure_audit_events_table,
    ensure_user_profile_picture_column,
    ensure_visible_to_column,
    ensure_quote_v2_sound_firm_column,
    ensure_rider_tables,
    ensure_service_provider_contact_columns,
    ensure_service_provider_onboarding_columns,
    ensure_service_provider_slug_column,
    backfill_service_provider_slugs,
    ensure_service_provider_slug_index,
    ensure_service_provider_vat_columns,
    ensure_invoice_agent_columns,
    ensure_invoice_booking_type_unique_index,
    ensure_invoice_sequences_table,
    ensure_booking_simple_agent_columns,
    ensure_invoice_number_unique_index,
    ensure_performance_indexes,
    ensure_message_system_key_index,
    ensure_message_core_indexes,
    ensure_notification_core_indexes,
    ensure_message_unread_indexes,
    ensure_booking_requests_user_indexes,
    seed_service_categories,
    ensure_service_moderation_logs,
    ensure_search_events_table,
)
from .middleware.security_headers import SecurityHeadersMiddleware
from .models.booking import Booking
from .models.notification import Notification
from .models.booking_request import BookingRequest
from .models.review import Review
from .models.service import Service
from .models.service_category import ServiceCategory
from .models.service_provider_profile import ServiceProviderProfile
from .models.user import User
from .utils.notifications import (
    alert_scheduler_failure,
    notify_quote_expired,
    notify_quote_expiring,
)
from .services.ops_scheduler import run_maintenance
from .services.admin_bootstrap import ensure_default_admin
from .utils.redis_cache import close_redis_client
from .utils.status_logger import register_status_listeners
from .api.v1.api_service_provider import read_all_service_provider_profiles
import httpx
from .utils.redis_cache import get_cached_artist_list
from .api import api_search_analytics, api_ai

# Configure logging before creating any loggers
setup_logging()
logger = logging.getLogger(__name__)

health_logger = logging.getLogger("app.health")

FLY_META: Dict[str, str] = {
    "fly_app": os.getenv("FLY_APP_NAME", ""),
    "fly_region": os.getenv("FLY_REGION", ""),
    "fly_machine_id": os.getenv("FLY_MACHINE_ID", ""),
    "fly_process_group": os.getenv("FLY_PROCESS_GROUP", ""),
}

_BOOT_TS = time.time()


@dataclass
class ReadyState:
    ready: bool = False
    reason: str = "starting"
    since_ts: float = time.time()
    last_probe_ts: float = 0.0
    last_ok_ts: float = 0.0
    last_err: Optional[str] = None
    db_ping_ms: Optional[float] = None
    loop_lag_ms: float = 0.0


READY = ReadyState()


def _set_ready(
    ready: bool,
    reason: str,
    err: Optional[str] = None,
    db_ping_ms: Optional[float] = None,
) -> None:
    changed = (ready != READY.ready) or (reason != READY.reason)
    READY.ready = ready
    READY.reason = reason
    READY.last_err = err
    READY.db_ping_ms = db_ping_ms
    if changed:
        READY.since_ts = time.time()
        lvl = health_logger.info if ready else health_logger.warning
        try:
            lvl(
                "health.ready.state_change",
                extra={
                    **FLY_META,
                    "ready": ready,
                    "reason": reason,
                    "error": err,
                    "db_ping_ms": db_ping_ms,
                    "pid": os.getpid(),
                },
            )
        except Exception:
            pass
    if ready:
        READY.last_ok_ts = time.time()


def _db_ping_sync() -> float:
    """Synchronous DB ping; must not run on the event loop."""
    t0 = time.perf_counter()
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return (time.perf_counter() - t0) * 1000.0


async def _readiness_poller() -> None:
    """Periodic readiness probe that caches DB/loop state for health checks."""
    await asyncio.sleep(0.2)
    while True:
        try:
            started = time.time()
            ping_ms = await asyncio.wait_for(
                asyncio.to_thread(_db_ping_sync),
                timeout=1.0,
            )
            _set_ready(True, "ok", db_ping_ms=round(ping_ms, 2))
        except asyncio.TimeoutError:
            _set_ready(False, "db_timeout", err="db ping exceeded 1.0s")
        except SA_TimeoutError as exc:
            # SQLAlchemy pool timeout (very relevant to DB pressure symptoms)
            _set_ready(False, "db_pool_timeout", err=str(exc))
        except Exception as exc:  # pragma: no cover - defensive guard
            _set_ready(False, "db_error", err=repr(exc))
        try:
            READY.last_probe_ts = time.time()
        except Exception:
            pass
        await asyncio.sleep(1.0)


async def _event_loop_lag_monitor(
    interval_s: float = 0.5,
    warn_ms: float = 1000.0,
) -> None:
    """Track event loop lag so we can detect stalls even when health routes fail."""
    loop = asyncio.get_running_loop()
    next_t = loop.time() + interval_s
    while True:
        await asyncio.sleep(interval_s)
        now = loop.time()
        lag_s = max(0.0, now - next_t)
        lag_ms = lag_s * 1000.0
        READY.loop_lag_ms = lag_ms
        if lag_ms >= warn_ms:
            try:
                health_logger.warning(
                    "health.loop_lag",
                    extra={**FLY_META, "lag_ms": round(lag_ms, 1), "pid": os.getpid()},
                )
            except Exception:
                pass
        next_t = now + interval_s

# Record bootstrap start so we can see how long schema/DDL work takes per
# process (useful when debugging health‑check flaps on restarts).
_bootstrap_started_at = datetime.utcnow()
_skip_db_bootstrap_raw = os.getenv("SKIP_DB_BOOTSTRAP", "0").strip().lower()
logger.info(
    "startup.bootstrap.begin skip_db_bootstrap=%s dialect=%s pid=%s",
    _skip_db_bootstrap_raw or "0",
    getattr(engine.dialect, "name", "unknown"),
    os.getpid(),
)

# Optionally enable tracemalloc for richer allocation tracebacks on RuntimeWarning hints
try:
    import tracemalloc  # type: ignore
    tracemalloc.start(25)
    logger.info("Tracemalloc started (25 frames)")
except Exception as _exc:  # pragma: no cover
    logger.warning("Tracemalloc start failed: %s", _exc)

# Register SQLAlchemy listeners that log status transitions
register_status_listeners()

# ─── Ensure database schema is up-to-date ──────────────────────────────────
ensure_message_type_column(engine)
normalize_message_type_values(engine)
ensure_message_core_columns(engine)
ensure_attachment_url_column(engine)
ensure_attachment_meta_column(engine)
ensure_message_is_read_column(engine)
ensure_visible_to_column(engine)
ensure_message_action_column(engine)
ensure_message_expires_at_column(engine)
ensure_message_system_key_column(engine)
ensure_message_reply_to_column(engine)
ensure_message_reactions_table(engine)
# One-time cleanup of legacy blank messages (safe/idempotent)
try:
    from .db_utils import cleanup_blank_messages
    deleted = cleanup_blank_messages(engine)
    if deleted:
        logger.info("Removed %s legacy blank messages", deleted)
except Exception as _exc:
    logger.warning("Blank message cleanup skipped: %s", _exc)
ensure_request_attachment_column(engine)
ensure_service_type_column(engine)
ensure_service_core_columns(engine)
ensure_timestamp_columns(engine, "services")
ensure_timestamp_defaults(engine, "services")
ensure_display_order_column(engine)
ensure_notification_link_column(engine)
ensure_custom_subtitle_column(engine)
ensure_price_visible_column(engine)
ensure_portfolio_image_urls_column(engine)
ensure_currency_column(engine)
ensure_media_url_column(engine)
ensure_service_travel_columns(engine)
ensure_service_managed_markup_column(engine)
ensure_service_status_column(engine)
ensure_mfa_columns(engine)
ensure_refresh_token_columns(engine)
ensure_booking_simple_columns(engine)
remove_deposit_columns_from_booking_simple(engine)
ensure_timestamp_columns(engine, "bookings_simple")
ensure_timestamp_defaults(engine, "bookings_simple")
ensure_timestamp_columns(engine, "bookings")
ensure_timestamp_defaults(engine, "bookings")
ensure_calendar_account_email_column(engine)
ensure_timestamp_columns(engine, "calendar_accounts")
ensure_timestamp_defaults(engine, "calendar_accounts")
ensure_timestamp_columns(engine, "service_provider_profiles")
ensure_timestamp_defaults(engine, "service_provider_profiles")
ensure_timestamp_columns(engine, "notifications")
ensure_timestamp_defaults(engine, "notifications")
ensure_timestamp_defaults(engine, "users")
ensure_timestamp_defaults(engine, "admin_users")
ensure_timestamp_defaults(engine, "booking_requests")
ensure_timestamp_defaults(engine, "quotes")
ensure_timestamp_defaults(engine, "quotes_v2")
ensure_timestamp_defaults(engine, "invoices")
ensure_user_profile_picture_column(engine)
ensure_booking_request_travel_columns(engine)
ensure_sound_outreach_columns(engine)
ensure_booking_event_city_column(engine)
ensure_booking_artist_deadline_column(engine)
ensure_quote_v2_sound_firm_column(engine)
ensure_rider_tables(engine)
if os.getenv("SKIP_DB_BOOTSTRAP", "0").strip().lower() not in {"1", "true", "yes"}:
    ensure_legacy_artist_user_type(engine)
    ensure_service_category_id_column(engine)
    seed_service_categories(engine)
    ensure_service_provider_contact_columns(engine)
    ensure_service_provider_onboarding_columns(engine)
    ensure_service_provider_slug_column(engine)
    backfill_service_provider_slugs(engine)
    ensure_service_provider_slug_index(engine)
    ensure_service_provider_vat_columns(engine)
    ensure_invoice_agent_columns(engine)
    ensure_invoice_sequences_table(engine)
    ensure_booking_simple_agent_columns(engine)
    ensure_invoice_number_unique_index(engine)
    ensure_invoice_booking_type_unique_index(engine)
    ensure_performance_indexes(engine)
    ensure_message_system_key_index(engine)
    ensure_message_core_indexes(engine)
    ensure_notification_core_indexes(engine)
    ensure_message_unread_indexes(engine)
    ensure_booking_requests_user_indexes(engine)
try:
    # Ensure key enums contain all labels in Postgres
    from .models.booking_status import BookingStatus
    from .models.notification import NotificationType
    from .models.calendar_account import CalendarProvider
    from .models.quote_v2 import QuoteStatusV2
    from .models.invoice import InvoiceStatus
    ensure_enum_values(engine, "bookingstatus", [s.value for s in BookingStatus])
    ensure_enum_values(engine, "notificationtype", [s.value for s in NotificationType])
    ensure_enum_values(engine, "calendarprovider", [s.value for s in CalendarProvider])
    ensure_enum_values(engine, "quotestatusv2", [s.value for s in QuoteStatusV2])
    ensure_enum_values(engine, "invoicestatus", [s.value for s in InvoiceStatus])
except Exception as _exc:
    logger.warning("Enum ensure skipped: %s", _exc)
if os.getenv("SKIP_DB_BOOTSTRAP", "0").strip().lower() not in {"1", "true", "yes"}:
    ensure_ledger_tables(engine)
    ensure_payout_tables(engine)
    ensure_dispute_table(engine)
    ensure_email_sms_event_tables(engine)
    ensure_audit_events_table(engine)
    ensure_service_moderation_logs(engine)
    ensure_search_events_table(engine)
    try:
        from .db_utils import ensure_booka_system_user
        ensure_booka_system_user(engine)
    except Exception as _exc:
        logger.warning("System user ensure skipped: %s", _exc)
    # Additive EventPrep schedule columns (safe/idempotent)
    try:
        from .db_utils import add_column_if_missing
        add_column_if_missing(engine, "event_preps", "soundcheck_time", "soundcheck_time TIME")
        add_column_if_missing(engine, "event_preps", "guests_arrival_time", "guests_arrival_time TIME")
        add_column_if_missing(engine, "event_preps", "performance_start_time", "performance_start_time TIME")
        add_column_if_missing(engine, "event_preps", "performance_end_time", "performance_end_time TIME")
        # Separate free-text field for schedule-specific notes
        add_column_if_missing(engine, "event_preps", "schedule_notes", "schedule_notes VARCHAR")
        # Separate free-text field for parking and access notes (Location section)
        add_column_if_missing(engine, "event_preps", "parking_access_notes", "parking_access_notes VARCHAR")
        # Canonical fields captured from Booking Wizard
        add_column_if_missing(engine, "event_preps", "event_type", "event_type VARCHAR")
        add_column_if_missing(engine, "event_preps", "guests_count", "guests_count INTEGER")
    except Exception as _exc:
        logger.warning("EventPrep schedule columns ensure skipped: %s", _exc)
Base.metadata.create_all(bind=engine)
try:
    ensure_default_admin()
except Exception as _exc:
    logger.warning("Default admin bootstrap skipped: %s", _exc)

_bootstrap_finished_at = datetime.utcnow()
_bootstrap_ms = int(
    (_bootstrap_finished_at - _bootstrap_started_at).total_seconds() * 1000
)
logger.info(
    "startup.bootstrap.end duration_ms=%s skip_db_bootstrap=%s pid=%s",
    _bootstrap_ms,
    _skip_db_bootstrap_raw or "0",
    os.getpid(),
)

# Always use ORJSONResponse for JSON payloads to ensure consistent, fast
# serialization across all endpoints.
app = FastAPI(title="Artist Booking API", default_response_class=ORJSONResponse)
setup_tracer(app)


# ─── Figure out the absolute filesystem path to `backend/app/static` ─────────
# (i.e. this file lives at backend/app/main.py, so __file__ is ".../backend/app/main.py")
THIS_DIR = os.path.dirname(__file__)  # backend/app
APP_STATIC_DIR = os.path.join(THIS_DIR, "static")  # backend/app/static
PROFILE_PICS_DIR = os.path.join(APP_STATIC_DIR, "profile_pics")
COVER_PHOTOS_DIR = os.path.join(APP_STATIC_DIR, "cover_photos")
# Portfolio images live under /static/portfolio_images
PORTFOLIO_IMAGES_DIR = os.path.join(APP_STATIC_DIR, "portfolio_images")

ATTACHMENTS_DIR = os.path.join(APP_STATIC_DIR, "attachments")
ATTACHMENTS_DIR_OVERRIDE = os.getenv("ATTACHMENTS_DIR")
ATTACHMENTS_DIR_FINAL = ATTACHMENTS_DIR

# Optional: base dir for persistent uploads (e.g., on Fly volume)
# When set, we'll symlink static subfolders to this base path so that
# files survive restarts/redeploys.
UPLOADS_DIR_OVERRIDE = os.getenv("UPLOADS_DIR")  # e.g. "/data/uploads"

INVOICE_PDFS_DIR = os.path.join(APP_STATIC_DIR, "invoices")

# Ensure all the subfolders exist
os.makedirs(PROFILE_PICS_DIR, exist_ok=True)
os.makedirs(COVER_PHOTOS_DIR, exist_ok=True)
os.makedirs(PORTFOLIO_IMAGES_DIR, exist_ok=True)
if ATTACHMENTS_DIR_OVERRIDE and os.path.abspath(ATTACHMENTS_DIR_OVERRIDE) != os.path.abspath(ATTACHMENTS_DIR):
    # Ensure override exists and point the static/attachments folder at it via symlink
    os.makedirs(ATTACHMENTS_DIR_OVERRIDE, exist_ok=True)
    try:
        # Replace attachments dir with a symlink to the override
        if os.path.islink(ATTACHMENTS_DIR) or os.path.exists(ATTACHMENTS_DIR):
            try:
                if os.path.islink(ATTACHMENTS_DIR):
                    os.unlink(ATTACHMENTS_DIR)
                else:
                    # Remove empty dir; if not empty, leave as-is
                    if not os.listdir(ATTACHMENTS_DIR):
                        os.rmdir(ATTACHMENTS_DIR)
            except Exception:
                pass
        os.makedirs(os.path.dirname(ATTACHMENTS_DIR), exist_ok=True)
        try:
            os.symlink(ATTACHMENTS_DIR_OVERRIDE, ATTACHMENTS_DIR)
        except FileExistsError:
            pass
        ATTACHMENTS_DIR_FINAL = ATTACHMENTS_DIR_OVERRIDE
    except Exception as _exc:
        logging.getLogger(__name__).warning("Failed to link attachments dir: %s", _exc)
        ATTACHMENTS_DIR_FINAL = ATTACHMENTS_DIR_OVERRIDE
else:
    os.makedirs(ATTACHMENTS_DIR, exist_ok=True)
    ATTACHMENTS_DIR_FINAL = ATTACHMENTS_DIR
os.makedirs(INVOICE_PDFS_DIR, exist_ok=True)

# If an uploads base dir is provided, symlink static folders to the volume
if UPLOADS_DIR_OVERRIDE:
    try:
        # Ensure base and subdirs exist on the volume
        for sub in ("profile_pics", "cover_photos", "portfolio_images"):
            os.makedirs(os.path.join(UPLOADS_DIR_OVERRIDE, sub), exist_ok=True)

        def _ensure_symlink(static_path: str, target_subdir: str) -> None:
            target = os.path.join(UPLOADS_DIR_OVERRIDE, target_subdir)
            # Replace the static subdir with a symlink to the volume path
            if os.path.islink(static_path) or os.path.exists(static_path):
                try:
                    if os.path.islink(static_path):
                        os.unlink(static_path)
                    else:
                        # Remove empty dir only; if not empty, leave it to avoid accidental data loss
                        if not os.listdir(static_path):
                            os.rmdir(static_path)
                except Exception:
                    # Best-effort; if we can't remove, skip
                    pass
            # Ensure parent exists and create symlink
            os.makedirs(os.path.dirname(static_path), exist_ok=True)
            try:
                os.symlink(target, static_path)
            except FileExistsError:
                pass

        _ensure_symlink(PROFILE_PICS_DIR, "profile_pics")
        _ensure_symlink(COVER_PHOTOS_DIR, "cover_photos")
        _ensure_symlink(PORTFOLIO_IMAGES_DIR, "portfolio_images")
    except Exception as _exc:
        logging.getLogger(__name__).warning("Uploads dir override failed: %s", _exc)


class StaticFilesWithDefault(StaticFiles):
    """Serve static files with a fallback default avatar."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and (
                path.startswith("profile_pics/")
                or path.startswith("cover_photos/")
                or path.startswith("portfolio_images/")
            ):
                # Fallbacks: avatar for profile pics; a neutral gray for others
                if path.startswith("profile_pics/"):
                    default_path = os.path.join(APP_STATIC_DIR, "default-avatar.svg")
                    media_type = "image/svg+xml"
                else:
                    # Use the avatar as a generic placeholder to avoid broken layouts
                    default_path = os.path.join(APP_STATIC_DIR, "default-avatar.svg")
                    media_type = "image/svg+xml"
                return FileResponse(default_path, media_type=media_type)
            raise


# ─── Mount “/static” so that requests to /static/... serve from backend/app/static/... ────
app.mount("/static", StaticFilesWithDefault(directory=APP_STATIC_DIR), name="static")

# ─── Also mount “/profile_pics” and “/cover_photos” at the root ─────────────────────────
# (so that a request to /profile_pics/whatever.jpg serves from backend/app/static/profile_pics/whatever.jpg)
app.mount("/profile_pics", StaticFiles(directory=PROFILE_PICS_DIR), name="profile_pics")
app.mount("/cover_photos", StaticFiles(directory=COVER_PHOTOS_DIR), name="cover_photos")
# Direct mount for attachments to avoid relying solely on /static path. This allows
# clients to request /attachments/<file> and hit the same backing directory.
try:
    app.mount("/attachments", StaticFiles(directory=ATTACHMENTS_DIR_FINAL), name="attachments")
except Exception as _exc:
    logger.warning("Failed to mount /attachments: %s", _exc)


# ─── CORS middleware (credentials-compatible, explicit allowlist) ─────────────
# With cookies, Access-Control-Allow-Origin cannot be "*". Build a safe allowlist.

def _merge_origins(*groups: Iterable[str]) -> list[str]:
    merged: list[str] = []
    for group in groups:
        for origin in group:
            if not origin:
                continue
            normalized = origin.rstrip("/")
            if normalized not in merged:
                merged.append(normalized)
    return merged


ADDITIONAL_ORIGINS = [
    "https://join.booka.co.za",
    "https://staging.booka.co.za",
    "https://dev.booka.co.za",
    "https://booka-admin.fly.dev",
]

ALLOWED_ORIGINS = _merge_origins(FRONTEND_ORIGINS, ADDITIONAL_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Link", "X-Total-Count", "Content-Range"],
)
logger.info("CORS origins set to: %s", ALLOWED_ORIGINS)

# OAuthlib's Starlette integration stores the authorization state in a
# session cookie. Ensure the cookie is accessible across app + API hosts
# when COOKIE_DOMAIN is configured (e.g., ".booka.co.za") so social login
# callbacks sent to api.booka.co.za can read the stored state.
session_kwargs = {
    "same_site": "lax",
    "https_only": False,
}
try:
    session_kwargs["https_only"] = settings.FRONTEND_URL.lower().startswith("https")
except Exception:
    pass
cookie_domain = auth.get_cookie_domain()
if cookie_domain:
    session_kwargs["domain"] = cookie_domain
# Allow disabling sessions when generating OpenAPI or running in minimal tooling
if _HAS_SESSIONS and os.getenv("DISABLE_SESSIONS", "0") != "1":
    app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY, **session_kwargs)
# Honor X-Forwarded-* headers from the reverse proxy so url_for() builds
# correct HTTPS callback URLs for OAuth (e.g., Google). This prevents
# redirect_uri mismatches in production behind TLS terminators.
if _HAS_PROXY_HEADERS and ProxyHeadersMiddleware is not None:
    app.add_middleware(ProxyHeadersMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def catch_exceptions(request: Request, call_next):
    """Return JSON responses for HTTP errors and log them."""
    try:
        response = await call_next(request)
    except StarletteHTTPException as exc:  # return the original status and detail
        logger.error(
            "HTTP error %s at %s: %s", exc.status_code, request.url.path, exc.detail
        )
        response = ORJSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}
        )
    except SA_TimeoutError as exc:  # DB pool timeout -> 503 to reduce retry storms
        logger.error("DB timeout at %s: %s", request.url.path, str(exc))
        response = ORJSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Database busy, please retry"},
        )
    except Exception as exc:  # pragma: no cover - generic handler
        logger.exception("Unhandled error: %s", exc)
        response = ORJSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal Server Error"},
        )

    # Ensure the CORS headers are present even when an exception occurs
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        # Mirror the header we emit on success responses so browsers keep sharing mode consistent
        if "Vary" not in response.headers:
            response.headers["Vary"] = "Origin"
    # Do not emit wildcard with credentials; browsers will reject it

    return response


@app.get("/healthz/live", tags=["health"])
async def health_live():
    """Liveness probe: process can respond; does not touch the DB."""
    return {
        "status": "ok",
        "kind": "live",
        "uptime_s": round(time.time() - _BOOT_TS, 1),
        "pid": os.getpid(),
        **FLY_META,
    }


@app.get("/healthz/ready", tags=["health"])
async def health_ready():
    """Readiness probe: cached DB ping state + loop lag."""
    now = time.time()
    # Treat stale probes as not-ready without mutating the cached READY state.
    last_probe = getattr(READY, "last_probe_ts", 0.0) or 0.0
    probe_age_s = now - last_probe if last_probe > 0 else None
    stale = probe_age_s is not None and probe_age_s > 5.0

    # Compute effective readiness combining cached DB probe + loop lag + staleness.
    effective_ready = bool(READY.ready)
    reasons: list[str] = []
    base_reason = READY.reason or "unknown"
    if not READY.ready:
        reasons.append(base_reason)
    if stale:
        effective_ready = False
        reasons.append("stale_probe")
    if READY.loop_lag_ms >= 5000:
        effective_ready = False
        reasons.append("loop_lag")

    if not reasons and effective_ready:
        reason = "ok"
    else:
        # Preserve primary cached reason first, then additional signals.
        seen: set[str] = set()
        ordered: list[str] = []
        for r in ([base_reason] + reasons):
            if not r or r in seen:
                continue
            seen.add(r)
            ordered.append(r)
        reason = ",".join(ordered) if ordered else "unknown"

    code = 200 if effective_ready else 503
    return ORJSONResponse(
        status_code=code,
        content={
            "status": "ok" if effective_ready else "error",
            "kind": "ready",
            "ready": effective_ready,
            "reason": reason,
            "ready_cached": READY.ready,
            "cached_reason": READY.reason,
            "error": READY.last_err,
            "db_ping_ms": READY.db_ping_ms,
            "loop_lag_ms": round(READY.loop_lag_ms, 1),
            "since_ts": READY.since_ts,
            "last_ok_ts": READY.last_ok_ts,
            "last_probe_ts": last_probe,
            "probe_age_s": round(probe_age_s, 2) if probe_age_s is not None else None,
            "uptime_s": round(time.time() - _BOOT_TS, 1),
            "pid": os.getpid(),
            **FLY_META,
        },
        headers={"Cache-Control": "no-store"},
    )


@app.get("/healthz", tags=["health"])
async def healthz():
    """Backwards-compatible alias; keep Fly pointed here until config is updated."""
    return await health_ready()


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return validation errors with details and log them for debugging.

    Provides a clearer message when an attachment upload omits the required
    file field so clients can display a helpful error.
    """
    errors = exc.errors()
    logger.warning("Validation error at %s: %s", request.url.path, errors)

    # Customize missing file errors for attachment uploads
    for err in errors:
        if err.get("loc") == ("body", "file"):
            return ORJSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={
                    "detail": {
                        "message": "No file provided",
                        "field_errors": {"file": "required"},
                    }
                },
            )

    return ORJSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": errors},
    )


api_prefix = settings.API_V1_STR  # usually something like "/api/v1"


# ─── AUTH ROUTES (no version prefix) ────────────────────────────────────────────────
# Clients will POST to /auth/register and /auth/login
app.include_router(auth.router, prefix="/auth", tags=["auth"])
if os.getenv("OPENAPI_MINIMAL", "0") != "1":
    try:
        from .api import api_oauth as _api_oauth  # type: ignore
        app.include_router(_api_oauth.router, prefix="/auth", tags=["auth"])
    except Exception:
        pass
    try:
        from .api import api_magic as _api_magic  # type: ignore
        app.include_router(_api_magic.router, prefix="/auth", tags=["auth"])
    except Exception:
        pass
    try:
        from .api import api_webauthn as _api_webauthn  # type: ignore
        app.include_router(_api_webauthn.router, prefix="/auth", tags=["auth"])
    except Exception:
        pass
app.include_router(api_admin.router, prefix="", tags=["admin"])
app.include_router(api_webhooks_events.router, prefix="", tags=["webhooks"])


# ─── SERVICE-PROVIDER PROFILE ROUTES (under /api/v1/service-provider-profiles) ──────────
app.include_router(
    api_service_provider_profiles.router,
    prefix=f"{api_prefix}/service-provider-profiles",
    tags=["service-provider-profiles"],
)

# ─── SEARCH ANALYTICS ROUTES (under /api/v1) ─────────────────────────────────────────
app.include_router(
    api_search_analytics.router,
    prefix=f"{api_prefix}",
    tags=["search-analytics"],
)

# ─── AI SEARCH ROUTES (under /api/v1/ai) ────────────────────────────────────────────
app.include_router(
    api_ai.router,
    prefix=f"{api_prefix}",
    tags=["ai"],
)

# Lightweight image proxy routes (e.g., avatar thumbs)
if os.getenv("OPENAPI_MINIMAL", "0") != "1":
    try:
        from .api.v1.api_images import img_router as _img_router  # type: ignore
        app.include_router(_img_router, prefix=f"{api_prefix}")
    except Exception:
        pass
app.include_router(api_attachments.router, prefix=f"{api_prefix}")


# ─── SERVICE ROUTES (under /api/v1/services) ────────────────────────────────────────
app.include_router(api_client_profile.router, prefix=f"{api_prefix}", tags=["client-profiles"])

# ─── SERVICE ROUTES (under /api/v1/services) ────────────────────────────────────────
app.include_router(
    api_service.router, prefix=f"{api_prefix}/services", tags=["services"]
)

# ─── SERVICE CATEGORY ROUTES (under /api/v1/service-categories) ───────────
app.include_router(
    api_service_category.router,
    prefix=f"{api_prefix}/service-categories",
    tags=["service-categories"],
)


# ─── BOOKING ROUTES (under /api/v1/bookings) ────────────────────────────────────────
app.include_router(
    api_booking.router, prefix=f"{api_prefix}/bookings", tags=["bookings"]
)
app.include_router(
    api_sound_outreach.router, prefix=f"{api_prefix}", tags=["sound-outreach"]
)


# ─── REVIEW ROUTES (under /api/v1/reviews) ──────────────────────────────────────────
app.include_router(api_review.router, prefix=f"{api_prefix}/reviews", tags=["reviews"])


# ─── BOOKING‐REQUEST ROUTES (under /api/v1/booking-requests) ─────────────────────────
app.include_router(
    api_booking_request.router,
    prefix=f"{api_prefix}/booking-requests",
    tags=["booking-requests"],
)


# ─── QUOTE ROUTES (under /api/v1) ─────────────────────────────────────────────
# Single quote router (formerly v2); legacy routes are retired.
app.include_router(api_quote.router, prefix=f"{api_prefix}", tags=["quotes"])
app.include_router(
    api_quote_template.router,
    prefix=f"{api_prefix}",
    tags=["quote-templates"],
)

# ─── OPS ROUTES (under /api/v1/ops) — testing/cron hooks ──────────────────────────
app.include_router(
    api_ops.router,
    prefix=f"{api_prefix}",
    tags=["ops"],
)

# Rider + Pricebook
app.include_router(
    api_rider.router,
    prefix=f"{api_prefix}",
    tags=["rider"],
)
app.include_router(
    api_pricebook.router,
    prefix=f"{api_prefix}",
    tags=["pricebooks"],
)
app.include_router(
    api_sound_estimate.router,
    prefix=f"{api_prefix}",
    tags=["sound-estimate"],
)
app.include_router(
    api_sound_prefs.router,
    prefix=f"{api_prefix}",
    tags=["sound-preferences"],
)

# ─── MESSAGE ROUTES (under /api/v1) ─────────────────────────────────────────
app.include_router(
    api_message.router,
    prefix=f"{api_prefix}",
    tags=["messages"],
)

app.include_router(
    api_ws.router,
    prefix=f"{api_prefix}",
    tags=["ws"],
)

# Generic uploads (images)
app.include_router(
    api_uploads.router,
    prefix=f"{api_prefix}",
    tags=["uploads"],
)

# ─── NOTIFICATION ROUTES (under /api/v1) ───────────────────────────────────────
app.include_router(
    api_notification.router,
    prefix=f"{api_prefix}",
    tags=["notifications"],
)

# ─── THREADS PREVIEW ROUTES (under /api/v1) ──────────────────────────────────
app.include_router(
    api_threads.router,
    prefix=f"{api_prefix}",
    tags=["threads"],
)

# ─── CALENDAR ROUTES (under /api/v1/google-calendar) ─────────────────────────
# Guard import so environments without Google libs don’t crash app startup.
try:
    from .api import api_calendar as _api_calendar  # type: ignore
    app.include_router(
        _api_calendar.router,
        prefix=f"{api_prefix}",
        tags=["google-calendar"],
    )
except Exception as _exc:  # pragma: no cover — optional feature
    logger.warning("Calendar routes disabled: %s", _exc)

# ─── COMPAT (legacy path aliases) ─────────────────────────────────────────────
app.include_router(
    api_artist_alias.router,
    prefix=f"{api_prefix}",
    tags=["compat"],
)

# ─── PAYMENT ROUTES (under /api/v1/payments) ─────────────────────────────
app.include_router(
    api_payment.router,
    prefix=f"{api_prefix}/payments",
    tags=["payments"],
)

# ─── PAYOUT ROUTES (under /api/v1/payouts) ─────────────────────────────
app.include_router(
    api_payout.router,
    prefix=f"{api_prefix}/payouts",
    tags=["payouts"],
)

# ─── INVOICE ROUTES (under /api/v1/invoices) ───────────────────────────
if os.getenv("OPENAPI_MINIMAL", "0") != "1":
    try:
        from .api import api_invoice  # type: ignore
        app.include_router(
            api_invoice.router,
            prefix=f"{api_prefix}/invoices",
            tags=["invoices"],
        )
    except Exception:
        pass

# ─── USER ROUTES (under /api/v1/users) ─────────────────────────────────────
app.include_router(
    api_user.router,
    prefix=f"{api_prefix}",
    tags=["users"],
)

# ─── SETTINGS ROUTES (under /api/v1) ─────────────────────────────────────────
app.include_router(
    api_settings.router,
    prefix=f"{api_prefix}",
    tags=["settings"],
)

# ─── TRAVEL FORECAST ROUTES (under /api/v1) ─────────────────────────────
app.include_router(
    api_weather.router,
    prefix=f"{api_prefix}",
    tags=["travel-forecast"],
)

# ─── FLIGHT ROUTES (under /api/v1) ───────────────────────────────────────────
if os.getenv("OPENAPI_MINIMAL", "0") != "1":
    try:
        from .api import api_flight  # type: ignore
        app.include_router(
            api_flight.router,
            prefix=f"{api_prefix}",
            tags=["flights"],
        )
    except Exception:
        pass

# ─── DISTANCE ROUTES (under /api/v1) ─────────────────────────────────────────
app.include_router(
    distance.router,
    prefix=f"{api_prefix}",
    tags=["distance"],
)


# Warn if the payment gateway URL is not configured
@app.on_event("startup")
def check_payment_gateway_url() -> None:
    """Log a warning when PAYMENT_GATEWAY_URL uses the default placeholder."""
    if settings.PAYMENT_GATEWAY_URL == "https://example.com":
        logger.warning(
            "PAYMENT_GATEWAY_URL is set to the default placeholder; update .env to your gateway URL"
        )


def process_quote_expiration(db):
    """Expire pending quotes and notify about upcoming expirations.

    Separated from the scheduler loop so the logic can be unit tested.
    """
    now = datetime.utcnow()
    soon = now + timedelta(hours=24)
    expiring = (
        db.query(models.QuoteV2)
        .filter(
            models.QuoteV2.status == models.QuoteStatusV2.PENDING.value,
            models.QuoteV2.expires_at != None,
            models.QuoteV2.expires_at > now,
            models.QuoteV2.expires_at <= soon,
        )
        .all()
    )
    for q in expiring:
        artist = q.artist
        client = q.client or db.query(models.User).get(q.client_id)
        notify_quote_expiring(db, artist, q.id, q.expires_at, q.booking_request_id)
        notify_quote_expiring(db, client, q.id, q.expires_at, q.booking_request_id)

    expired = crud_quote.expire_pending_quotes(db)
    for q in expired:
        artist = q.artist
        client = q.client or db.query(models.User).get(q.client_id)
        notify_quote_expired(db, artist, q.id, q.booking_request_id)
        notify_quote_expired(db, client, q.id, q.booking_request_id)


async def expire_quotes_loop() -> None:
    """Periodically expire pending quotes and send notifications.

    This lightweight scheduler runs once per hour to handle quote
    expirations and reminders.
    """
    while True:
        await asyncio.sleep(3600)
        # Retry with backoff on transient DB failures
        delay = 5
        max_retries = 5

        def _expire_once() -> None:
            with SessionLocal() as db:
                process_quote_expiration(db)

        for attempt in range(max_retries):
            try:
                await asyncio.to_thread(_expire_once)
                break
            except OperationalError as exc:  # pragma: no cover - transient DB outage
                alert_scheduler_failure(exc)
                if attempt < max_retries - 1:
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 60)
                    continue
                else:
                    # Give up for this cycle; try again next tick
                    break
            except Exception as exc:  # pragma: no cover - log and continue
                alert_scheduler_failure(exc)
                break


async def ops_maintenance_loop() -> None:
    """Periodic operational tasks: reminders and outreach upkeep."""
    while True:
        # Run every 30 minutes for timely nudges/reminders without being noisy
        await asyncio.sleep(1800)
        delay = 5
        max_retries = 5
        for attempt in range(max_retries):
            try:
                summary = await asyncio.to_thread(run_maintenance)
                logger.info("Maintenance summary: %s", summary)
                break
            except OperationalError as exc:  # pragma: no cover - transient DB outage
                alert_scheduler_failure(exc)
                if attempt < max_retries - 1:
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 60)
                    continue
                else:
                    # Give up for this cycle; try again next tick
                    break
            except Exception as exc:  # pragma: no cover - continue running
                alert_scheduler_failure(exc)
                break


async def _wait_for_db_ready(max_wait_seconds: int = 30, interval_seconds: float = 1.0) -> None:
    """Best-effort wait until the database is reachable before launching schedulers.

    Does not raise if the DB stays unavailable beyond ``max_wait_seconds``;
    background loops also have their own backoff.
    """
    elapsed = 0.0
    while elapsed < max_wait_seconds:
        try:
            await asyncio.wait_for(
                asyncio.to_thread(_db_ping_sync),
                timeout=1.0,
            )
            return
        except Exception:
            await asyncio.sleep(interval_seconds)
            elapsed += interval_seconds
    logger.warning("DB readiness check timed out; starting tasks with backoff enabled")


@app.on_event("startup")
async def start_health_monitors() -> None:
    """Start background health monitors for readiness and loop lag."""
    asyncio.create_task(_event_loop_lag_monitor())
    asyncio.create_task(_readiness_poller())


@app.on_event("startup")
async def start_background_tasks() -> None:
    """Launch background maintenance tasks."""
    # Ensure DB is reachable before starting periodic schedulers
    await _wait_for_db_ready()
    # Start WebSocket Redis bus consumer (cross-instance fanout)
    try:
        from app.api import api_ws as _api_ws
        await _api_ws.ensure_ws_bus_started()
    except Exception:
        pass
    asyncio.create_task(expire_quotes_loop())
    asyncio.create_task(ops_maintenance_loop())


# ─── A simple root check ─────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Welcome to Artist Booking API"}


@app.get("/favicon.ico")
async def favicon():
    """Serve a default favicon to avoid 404 noise in logs.

    Uses the existing default avatar SVG; browsers will still accept it.
    """
    path = os.path.join(APP_STATIC_DIR, "default-avatar.svg")
    if os.path.exists(path):
        return FileResponse(path, media_type="image/svg+xml")
    return ORJSONResponse(status_code=status.HTTP_204_NO_CONTENT, content={})


@app.on_event("shutdown")
def shutdown_redis_client() -> None:
    """Close Redis connections when the application shuts down."""
    logger.info("Closing Redis client")
    close_redis_client()


@app.on_event("startup")
async def warm_cache_on_startup() -> None:
    """Warm the homepage list via an internal HTTP GET so ETag/Redis are engaged.

    Best effort; if it fails, we simply skip warming.
    """
    try:
        if get_cached_artist_list(1, limit=12) is not None:
            return
        url = f"http://127.0.0.1:{os.getenv('PORT','8000')}{settings.API_V1_STR}/service-provider-profiles/?limit=12&sort=newest&fields=id,business_name,profile_picture_url"
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.get(url)
    except Exception as exc:
        logger.warning("Warm-cache skipped: %s", exc)
