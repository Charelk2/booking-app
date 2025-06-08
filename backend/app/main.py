# backend/app/main.py

import os
import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from .database import engine, Base
from .db_utils import (
    ensure_message_type_column,
    ensure_attachment_url_column,
    ensure_service_type_column,
    ensure_display_order_column,
    ensure_notification_link_column,
    ensure_custom_subtitle_column,
    ensure_request_attachment_column,
)
from .models.user import User
from .models.artist_profile_v2 import ArtistProfileV2 as ArtistProfile
from .models.service import Service
from .models.booking import Booking
from .models.review import Review
from .models.request_quote import BookingRequest, Quote
from .models.notification import Notification

# Routers under app/api/
from .api import auth
from .api import (
    api_service,
    api_booking,
    api_review,
    api_booking_request,
    api_quote,
    api_sound_provider,
    api_ws,
    api_message,
    api_notification,
    api_payment,
)

# The “artist‐profiles” router lives under app/api/v1/
from .api.v1 import api_artist

from .core.config import settings

logger = logging.getLogger(__name__)

# ─── Ensure database schema is up-to-date ──────────────────────────────────
ensure_message_type_column(engine)
ensure_attachment_url_column(engine)
ensure_request_attachment_column(engine)
ensure_service_type_column(engine)
ensure_display_order_column(engine)
ensure_notification_link_column(engine)
ensure_custom_subtitle_column(engine)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Artist Booking API")


# ─── Figure out the absolute filesystem path to `backend/app/static` ─────────
# (i.e. this file lives at backend/app/main.py, so __file__ is ".../backend/app/main.py")
THIS_DIR = os.path.dirname(__file__)  # backend/app
APP_STATIC_DIR = os.path.join(THIS_DIR, "static")  # backend/app/static
PROFILE_PICS_DIR = os.path.join(APP_STATIC_DIR, "profile_pics")
COVER_PHOTOS_DIR = os.path.join(APP_STATIC_DIR, "cover_photos")
ATTACHMENTS_DIR = os.path.join(APP_STATIC_DIR, "attachments")

# Ensure all the subfolders exist
os.makedirs(PROFILE_PICS_DIR, exist_ok=True)
os.makedirs(COVER_PHOTOS_DIR, exist_ok=True)
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)


# ─── Mount “/static” so that requests to /static/... serve from backend/app/static/... ────
app.mount("/static", StaticFiles(directory=APP_STATIC_DIR), name="static")

# ─── Also mount “/profile_pics” and “/cover_photos” at the root ─────────────────────────
# (so that a request to /profile_pics/whatever.jpg serves from backend/app/static/profile_pics/whatever.jpg)
app.mount("/profile_pics", StaticFiles(directory=PROFILE_PICS_DIR), name="profile_pics")
app.mount("/cover_photos", StaticFiles(directory=COVER_PHOTOS_DIR), name="cover_photos")


# ─── CORS middleware (adjust allow_origins if your frontend is hosted elsewhere) ─────────
# Allow configurable origins (defaults to * for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def catch_exceptions(request: Request, call_next):
    """Return JSON 500 errors so CORS headers are included."""
    try:
        return await call_next(request)
    except Exception as exc:  # pragma: no cover - generic handler
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal Server Error"},
        )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return 422 errors with details and log them for debugging."""
    logger.warning("Validation error at %s: %s", request.url.path, exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


api_prefix = settings.API_V1_STR  # usually something like "/api/v1"


# ─── AUTH ROUTES (no version prefix) ────────────────────────────────────────────────
# Clients will POST to /auth/register and /auth/login
app.include_router(auth.router, prefix="/auth", tags=["auth"])


# ─── ARTIST‐PROFILE ROUTES (under /api/v1/artist-profiles) ──────────────────────────
app.include_router(
    api_artist.router, prefix=f"{api_prefix}/artist-profiles", tags=["artist-profiles"]
)


# ─── SERVICE ROUTES (under /api/v1/services) ────────────────────────────────────────
app.include_router(
    api_service.router, prefix=f"{api_prefix}/services", tags=["services"]
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
app.include_router(api_quote.router, prefix=f"{api_prefix}", tags=["quotes"])

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

# ─── PAYMENT ROUTES (under /api/v1/payments) ─────────────────────────────
app.include_router(
    api_payment.router,
    prefix=f"{api_prefix}/payments",
    tags=["payments"],
)


# ─── A simple root check ─────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Welcome to Artist Booking API"}
