# backend/app/main.py

import os
import logging
import asyncio
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, status
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .middleware.security_headers import SecurityHeadersMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, ORJSONResponse
from fastapi.exceptions import RequestValidationError

from .database import engine, Base
from .database import SessionLocal
from .db_utils import (
    ensure_message_type_column,
    ensure_attachment_url_column,
    ensure_message_is_read_column,
    ensure_visible_to_column,
    ensure_message_action_column,
    ensure_message_expires_at_column,
    ensure_service_type_column,
    ensure_display_order_column,
    ensure_notification_link_column,
    ensure_custom_subtitle_column,
    ensure_price_visible_column,
    ensure_portfolio_image_urls_column,
    ensure_currency_column,
    ensure_media_url_column,
    ensure_service_travel_columns,
    ensure_mfa_columns,
    ensure_request_attachment_column,
    ensure_booking_simple_columns,
    ensure_calendar_account_email_column,
    ensure_user_profile_picture_column,
    ensure_booking_request_travel_columns,
    ensure_legacy_artist_user_type,
    ensure_service_category_id_column,
    seed_service_categories,
)
from .models.user import User
from .models.service_provider_profile import ServiceProviderProfile
from .models.service import Service
from .models.service_category import ServiceCategory
from .models.booking import Booking
from .models.review import Review
from .models.request_quote import BookingRequest, Quote
from .models.notification import Notification
from . import models

# Routers under app/api/
from .api import auth
from .api import api_oauth
from .api import (
    api_service,
    api_booking,
    api_review,
    api_booking_request,
    api_quote,
    api_quote_v2,
    api_sound_provider,
    api_ws,
    api_message,
    api_notification,
    api_payment,
    api_invoice,
    api_user,
    api_calendar,
    api_quote_template,
    api_settings,
    api_weather,
    api_flight,
    api_service_category,
)
from routes import distance

# The “service-provider-profiles” router lives under app/api/v1/
from .api.v1 import api_service_provider as api_service_provider_profiles

from .core.config import settings
from .utils.redis_cache import close_redis_client
from .crud import crud_quote_v2
from .utils.notifications import (
    notify_quote_expired,
    notify_quote_expiring,
    alert_scheduler_failure,
)
from .utils.status_logger import register_status_listeners
from .core.observability import setup_logging, setup_tracer

# Configure logging before creating any loggers
setup_logging()
logger = logging.getLogger(__name__)

# Register SQLAlchemy listeners that log status transitions
register_status_listeners()

# ─── Ensure database schema is up-to-date ──────────────────────────────────
ensure_message_type_column(engine)
ensure_attachment_url_column(engine)
ensure_message_is_read_column(engine)
ensure_visible_to_column(engine)
ensure_message_action_column(engine)
ensure_message_expires_at_column(engine)
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
ensure_mfa_columns(engine)
ensure_booking_simple_columns(engine)
ensure_calendar_account_email_column(engine)
ensure_user_profile_picture_column(engine)
ensure_booking_request_travel_columns(engine)
ensure_legacy_artist_user_type(engine)
ensure_service_category_id_column(engine)
seed_service_categories(engine)
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

# ─── SOUND PROVIDER ROUTES (under /api/v1/sound-providers) ───────────────
app.include_router(
    api_sound_provider.router,
    prefix=f"{api_prefix}/sound-providers",
    tags=["sound-providers"],
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


@app.on_event("startup")
async def start_background_tasks() -> None:
    """Launch background maintenance tasks."""
    asyncio.create_task(expire_quotes_loop())


# ─── A simple root check ─────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Welcome to Artist Booking API"}


@app.on_event("shutdown")
def shutdown_redis_client() -> None:
    """Close Redis connections when the application shuts down."""
    logger.info("Closing Redis client")
    close_redis_client()
