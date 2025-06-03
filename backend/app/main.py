# backend/app/main.py

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import engine, Base
from .models.user               import User
from .models.artist_profile_v2  import ArtistProfileV2 as ArtistProfile
from .models.service            import Service
from .models.booking            import Booking
from .models.review             import Review
from .models.request_quote      import BookingRequest, Quote

# Routers under app/api/
from .api       import auth
from .api       import api_service, api_booking, api_review, api_booking_request, api_quote
# The “artist‐profiles” router lives under app/api/v1/
from .api.v1    import api_artist

from .core.config import settings

# ─── Create all tables if they don’t exist yet ──────────────────────────────
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Artist Booking API")


# ─── Figure out the absolute filesystem path to `backend/app/static` ─────────
# (i.e. this file lives at backend/app/main.py, so __file__ is ".../backend/app/main.py")
THIS_DIR = os.path.dirname(__file__)                    # backend/app
APP_STATIC_DIR = os.path.join(THIS_DIR, "static")      # backend/app/static
PROFILE_PICS_DIR = os.path.join(APP_STATIC_DIR, "profile_pics")
COVER_PHOTOS_DIR = os.path.join(APP_STATIC_DIR, "cover_photos")

# Ensure all the subfolders exist
os.makedirs(PROFILE_PICS_DIR, exist_ok=True)
os.makedirs(COVER_PHOTOS_DIR, exist_ok=True)


# ─── Mount “/static” so that requests to /static/... serve from backend/app/static/... ────
app.mount(
    "/static",
    StaticFiles(directory=APP_STATIC_DIR),
    name="static"
)

# ─── Also mount “/profile_pics” and “/cover_photos” at the root ─────────────────────────
# (so that a request to /profile_pics/whatever.jpg serves from backend/app/static/profile_pics/whatever.jpg)
app.mount(
    "/profile_pics",
    StaticFiles(directory=PROFILE_PICS_DIR),
    name="profile_pics"
)
app.mount(
    "/cover_photos",
    StaticFiles(directory=COVER_PHOTOS_DIR),
    name="cover_photos"
)


# ─── CORS middleware (adjust allow_origins if your frontend is hosted elsewhere) ─────────
# Allow configurable origins (defaults to * for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = settings.API_V1_STR  # usually something like "/api/v1"


# ─── AUTH ROUTES (no version prefix) ────────────────────────────────────────────────
# Clients will POST to /auth/register and /auth/login
app.include_router(auth.router, prefix="/auth", tags=["auth"])


# ─── ARTIST‐PROFILE ROUTES (under /api/v1/artist-profiles) ──────────────────────────
app.include_router(
    api_artist.router,
    prefix=f"{api_prefix}/artist-profiles",
    tags=["artist-profiles"]
)


# ─── SERVICE ROUTES (under /api/v1/services) ────────────────────────────────────────
app.include_router(
    api_service.router,
    prefix=f"{api_prefix}/services",
    tags=["services"]
)


# ─── BOOKING ROUTES (under /api/v1/bookings) ────────────────────────────────────────
app.include_router(
    api_booking.router,
    prefix=f"{api_prefix}/bookings",
    tags=["bookings"]
)


# ─── REVIEW ROUTES (under /api/v1/reviews) ──────────────────────────────────────────
app.include_router(
    api_review.router,
    prefix=f"{api_prefix}/reviews",
    tags=["reviews"]
)


# ─── BOOKING‐REQUEST ROUTES (under /api/v1/booking-requests) ─────────────────────────
app.include_router(
    api_booking_request.router,
    prefix=f"{api_prefix}/booking-requests",
    tags=["booking-requests"]
)


# ─── QUOTE ROUTES (under /api/v1/quotes) ────────────────────────────────────────────
app.include_router(
    api_quote.router,
    prefix=f"{api_prefix}/quotes",
    tags=["quotes"]
)


# ─── A simple root check ─────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Welcome to Artist Booking API"}
