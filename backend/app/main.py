# backend/app/main.py

import asyncio
import logging
import os
from datetime import datetime, timedelta

from fastapi import FastAPI, Request, status
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, ORJSONResponse
from fastapi.staticfiles import StaticFiles
from routes import distance
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware

from . import models

# Routers under app/api/
from .api import (
    api_booking,
    api_booking_request,
    api_calendar,
    api_flight,
    api_invoice,
    api_message,
    api_notification,
    api_threads,
    api_oauth,
    api_payment,
    api_quote,
    api_quote_template,
    api_quote_v2,
    api_rider,
    api_pricebook,
    api_sound_prefs,
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
)

# The “service-provider-profiles” router lives under app/api/v1/
from .api.v1 import api_service_provider as api_service_provider_profiles
from .core.config import settings
from .core.observability import setup_logging, setup_tracer
from .crud import crud_quote_v2
from .database import Base, SessionLocal, engine
from .db_utils import (
    ensure_attachment_url_column,
    ensure_booking_event_city_column,
    ensure_booking_request_travel_columns,
    ensure_booking_simple_columns,
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
    ensure_service_managed_markup_column,
    ensure_user_profile_picture_column,
    ensure_visible_to_column,
    ensure_quote_v2_sound_firm_column,
    ensure_rider_tables,
    seed_service_categories,
)
from .middleware.security_headers import SecurityHeadersMiddleware
from .models.booking import Booking
from .models.notification import Notification
from .models.request_quote import BookingRequest, Quote
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
from .utils.redis_cache import close_redis_client
from .utils.status_logger import register_status_listeners

# Configure logging before creating any loggers
setup_logging()
logger = logging.getLogger(__name__)

# Register SQLAlchemy listeners that log status transitions
register_status_listeners()

# ─── Ensure database schema is up-to-date ──────────────────────────────────
ensure_message_type_column(engine)
normalize_message_type_values(engine)
ensure_message_core_columns(engine)
ensure_attachment_url_column(engine)
ensure_message_is_read_column(engine)
ensure_visible_to_column(engine)
ensure_message_action_column(engine)
ensure_message_expires_at_column(engine)
ensure_message_system_key_column(engine)
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
ensure_display_order_column(engine)
ensure_notification_link_column(engine)
ensure_custom_subtitle_column(engine)
ensure_price_visible_column(engine)
ensure_portfolio_image_urls_column(engine)
ensure_currency_column(engine)
ensure_media_url_column(engine)
ensure_service_travel_columns(engine)
ensure_service_managed_markup_column(engine)
ensure_mfa_columns(engine)
ensure_refresh_token_columns(engine)
ensure_booking_simple_columns(engine)
ensure_calendar_account_email_column(engine)
ensure_user_profile_picture_column(engine)
ensure_booking_request_travel_columns(engine)
ensure_sound_outreach_columns(engine)
ensure_booking_event_city_column(engine)
ensure_booking_artist_deadline_column(engine)
ensure_quote_v2_sound_firm_column(engine)
ensure_rider_tables(engine)
ensure_legacy_artist_user_type(engine)
ensure_service_category_id_column(engine)
seed_service_categories(engine)
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
except Exception as _exc:
    logger.warning("EventPrep schedule columns ensure skipped: %s", _exc)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Artist Booking API", default_response_class=ORJSONResponse)
setup_tracer(app)


# ─── Figure out the absolute filesystem path to `backend/app/static` ─────────
# (i.e. this file lives at backend/app/main.py, so __file__ is ".../backend/app/main.py")
THIS_DIR = os.path.dirname(__file__)  # backend/app
APP_STATIC_DIR = os.path.join(THIS_DIR, "static")  # backend/app/static
PROFILE_PICS_DIR = os.path.join(APP_STATIC_DIR, "profile_pics")
COVER_PHOTOS_DIR = os.path.join(APP_STATIC_DIR, "cover_photos")
ATTACHMENTS_DIR = os.path.join(APP_STATIC_DIR, "attachments")
INVOICE_PDFS_DIR = os.path.join(APP_STATIC_DIR, "invoices")

# Ensure all the subfolders exist
os.makedirs(PROFILE_PICS_DIR, exist_ok=True)
os.makedirs(COVER_PHOTOS_DIR, exist_ok=True)
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)
os.makedirs(INVOICE_PDFS_DIR, exist_ok=True)


class StaticFilesWithDefault(StaticFiles):
    """Serve static files with a fallback default avatar."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and path.startswith("profile_pics/"):
                default_path = os.path.join(APP_STATIC_DIR, "default-avatar.svg")
                ext = os.path.splitext(path)[1].lower()
                media_type = "image/svg+xml"
                if ext in {".jpg", ".jpeg"}:
                    media_type = "image/jpeg"
                elif ext == ".png":
                    media_type = "image/png"
                return FileResponse(default_path, media_type=media_type)
            raise


# ─── Mount “/static” so that requests to /static/... serve from backend/app/static/... ────
app.mount("/static", StaticFilesWithDefault(directory=APP_STATIC_DIR), name="static")

# ─── Also mount “/profile_pics” and “/cover_photos” at the root ─────────────────────────
# (so that a request to /profile_pics/whatever.jpg serves from backend/app/static/profile_pics/whatever.jpg)
app.mount("/profile_pics", StaticFiles(directory=PROFILE_PICS_DIR), name="profile_pics")
app.mount("/cover_photos", StaticFiles(directory=COVER_PHOTOS_DIR), name="cover_photos")


# ─── CORS middleware (adjust allow_origins if your frontend is hosted elsewhere) ─────────
# Allow configurable origins or "*" when CORS_ALLOW_ALL is enabled
allow_origins = ["*"] if settings.CORS_ALLOW_ALL else (settings.CORS_ORIGINS or ["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS origins set to: %s", allow_origins)

# OAuthlib's Starlette integration stores the authorization state in a
# session cookie. Add SessionMiddleware so Authlib can sign and read
# that cookie using our SECRET_KEY.
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)
app.add_middleware(SecurityHeadersMiddleware)


@app.middleware("http")
async def catch_exceptions(request: Request, call_next):
    """Return JSON responses for HTTP errors and log them."""
    try:
        response = await call_next(request)
    except StarletteHTTPException as exc:  # return the original status and detail
        logger.error(
            "HTTP error %s at %s: %s", exc.status_code, request.url.path, exc.detail
        )
        response = JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}
        )
    except Exception as exc:  # pragma: no cover - generic handler
        logger.exception("Unhandled error: %s", exc)
        response = JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal Server Error"},
        )

    # Ensure the CORS headers are present even when an exception occurs
    origin = request.headers.get("origin")
    if origin and ("*" in allow_origins or origin in allow_origins):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    elif "*" in allow_origins:
        response.headers["Access-Control-Allow-Origin"] = "*"

    return response


@app.get("/healthz", tags=["health"])
async def healthz():
    """Lightweight unauthenticated health check for load balancers."""
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


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
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={
                    "detail": {
                        "message": "No file provided",
                        "field_errors": {"file": "required"},
                    }
                },
            )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": errors},
    )


api_prefix = settings.API_V1_STR  # usually something like "/api/v1"


# ─── AUTH ROUTES (no version prefix) ────────────────────────────────────────────────
# Clients will POST to /auth/register and /auth/login
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(api_oauth.router, prefix="/auth", tags=["auth"])


# ─── SERVICE-PROVIDER PROFILE ROUTES (under /api/v1/service-provider-profiles) ──────────
app.include_router(
    api_service_provider_profiles.router,
    prefix=f"{api_prefix}/service-provider-profiles",
    tags=["service-provider-profiles"],
)


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
# Register the newer v2 routes first so they take precedence when paths overlap
app.include_router(api_quote_v2.router, prefix=f"{api_prefix}", tags=["quotes-v2"])
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
app.include_router(
    api_calendar.router,
    prefix=f"{api_prefix}",
    tags=["google-calendar"],
)

# ─── PAYMENT ROUTES (under /api/v1/payments) ─────────────────────────────
app.include_router(
    api_payment.router,
    prefix=f"{api_prefix}/payments",
    tags=["payments"],
)

# ─── INVOICE ROUTES (under /api/v1/invoices) ───────────────────────────
app.include_router(
    api_invoice.router,
    prefix=f"{api_prefix}/invoices",
    tags=["invoices"],
)

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
app.include_router(
    api_flight.router,
    prefix=f"{api_prefix}",
    tags=["flights"],
)

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
            models.QuoteV2.status == models.QuoteStatusV2.PENDING,
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

    expired = crud_quote_v2.expire_pending_quotes(db)
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
        try:
            with SessionLocal() as db:
                process_quote_expiration(db)
        except Exception as exc:  # pragma: no cover - log and alert then continue
            alert_scheduler_failure(exc)


async def ops_maintenance_loop() -> None:
    """Periodic operational tasks: reminders and outreach upkeep."""
    while True:
        # Run every 30 minutes for timely nudges/reminders without being noisy
        await asyncio.sleep(1800)
        try:
            with SessionLocal() as db:
                summary = run_maintenance(db)
                logger.info("Maintenance summary: %s", summary)
        except Exception as exc:  # pragma: no cover - continue running
            alert_scheduler_failure(exc)

@app.on_event("startup")
async def start_background_tasks() -> None:
    """Launch background maintenance tasks."""
    asyncio.create_task(expire_quotes_loop())
    asyncio.create_task(ops_maintenance_loop())


# ─── A simple root check ─────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Welcome to Artist Booking API"}


@app.on_event("shutdown")
def shutdown_redis_client() -> None:
    """Close Redis connections when the application shuts down."""
    logger.info("Closing Redis client")
    close_redis_client()
