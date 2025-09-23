from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from typing import Any, ClassVar
import json
from pathlib import Path
import os


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"

    # JWT configuration (provide a fallback for local development)
    SECRET_KEY: str = "fallback_secret_for_dev_only"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Database URL
    # Use an absolute path so running the app from different directories
    # (e.g., repo root or backend/) always resolves the same DB file.
    BASE_DIR: ClassVar[Path] = Path(__file__).resolve().parents[2]
    SQLALCHEMY_DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'booking.db'}"

    # Redis connection URL for caching
    REDIS_URL: str = "redis://localhost:6379/0"

    # CORS origins
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3002"]
    CORS_ALLOW_ALL: bool = False

    # Frontend domains
    FRONTEND_ORIGINS: list[str] = []
    FRONTEND_PRIMARY: str = ""

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/google-calendar/callback"
    GOOGLE_OAUTH_REDIRECT_URI: str = ""

    # Social login OAuth credentials
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    # Facebook OAuth
    FACEBOOK_CLIENT_ID: str = ""
    FACEBOOK_CLIENT_SECRET: str = ""

    # Apple Sign-in
    APPLE_CLIENT_ID: str = ""
    APPLE_TEAM_ID: str = ""
    APPLE_KEY_ID: str = ""
    APPLE_PRIVATE_KEY: str = ""

    # API key used on the frontend for Google Maps components. The backend does
    # not use this value but includes it so loading `.env` files shared with the
    # frontend does not raise a validation error when extra fields are forbidden
    # by Pydantic settings.
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: str = ""
    # Frontend One Tap client id (mirrors GOOGLE_OAUTH_CLIENT_ID); included to
    # prevent validation errors when the backend loads the shared .env.
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: str = ""
    GOOGLE_MAPS_API_KEY: str = ""

    # Base frontend URL used for OAuth redirects
    FRONTEND_URL: str = "http://localhost:3000"

    # Optional cookie domain to scope auth cookies across subdomains.
    # Example: ".booka.co.za" so cookies work on both booka.co.za and api.booka.co.za
    COOKIE_DOMAIN: str = ""

    # Default currency code used across the application
    DEFAULT_CURRENCY: str = "ZAR"

    # Recommendation fallback list size
    RECOMMENDATION_FALLBACK_LIMIT: int = 5

    # Login rate limiting
    MAX_LOGIN_ATTEMPTS: int = 5
    LOGIN_ATTEMPT_WINDOW: int = 300  # seconds

    # Payment gateway base URL
    PAYMENT_GATEWAY_URL: str = "https://example.com"
    # Paystack test/live keys (optional)
    PAYSTACK_SECRET_KEY: str = ""
    PAYSTACK_PUBLIC_KEY: str = ""
    PAYSTACK_CALLBACK_URL: str = ""

    # SMTP email settings
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 25
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "no-reply@localhost"

    # Feature flag: when creating a booking request, also emit a NEW_MESSAGE
    # notification so unread thread counts increment for service providers who
    # rely on message threads as the primary inbox surface. Disabled by default.
    EMIT_NEW_MESSAGE_FOR_NEW_REQUEST: bool = False

    # Feature flag: Event Prep (backend awareness only)
    FEATURE_EVENT_PREP: bool = False
    # Frontend env passthrough to avoid validation errors when extra is forbid
    NEXT_PUBLIC_FEATURE_EVENT_PREP: str = ""

    # Email Dev Mode: include reset links in the API response and logs to ease local testing
    EMAIL_DEV_MODE: bool = True

    # Admin allowlist: explicit emails and/or whole domains
    # Keep as plain strings to avoid JSON-only decoding of lists in BaseSettings.
    # Other modules (e.g., api_admin.py) parse these with os.getenv/splitting.
    ADMIN_EMAILS: str = ""
    ADMIN_DOMAINS: str = ""

    # R2 / S3-compatible storage configuration (Cloudflare R2)
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET: str = ""
    # Example: https://<account_id>.r2.cloudflarestorage.com or EU endpoint
    R2_S3_ENDPOINT: str = ""
    # Public custom domain for reads (e.g., https://media.booka.co.za)
    R2_PUBLIC_BASE_URL: str = ""
    # Presign TTLs (seconds)
    R2_PRESIGN_UPLOAD_TTL: int = 3600  # 1h
    R2_PRESIGN_DOWNLOAD_TTL: int = 604800  # 7d

    @field_validator("CORS_ORIGINS", mode="before")
    def split_origins(cls, v: Any) -> list[str]:
        """Parse comma-separated or JSON list of origins from environment."""
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @field_validator("ADMIN_EMAILS", "ADMIN_DOMAINS", mode="before")
    def strip_admin_values(cls, v: Any) -> Any:
        # Normalize whitespace; downstream code splits by commas or parses JSON if needed.
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator(
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "FRONTEND_URL",
        mode="before",
    )
    def strip_whitespace(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v


    @model_validator(mode="after")
    def allow_all_if_requested(cls, values: "Settings") -> "Settings":
        if values.CORS_ALLOW_ALL:
            values.CORS_ORIGINS = ["*"]
        return values

    @model_validator(mode="after")
    def prefer_data_volume_for_sqlite(cls, values: "Settings") -> "Settings":
        """If running on a host with a data volume (e.g., Fly.io mounts /data),
        prefer storing the SQLite DB at /data/booking.db unless an explicit
        SQLALCHEMY_DATABASE_URL is provided via environment.

        This avoids losing data on container restarts/redeploys.
        """
        try:
            # Only auto-switch for sqlite defaults; respect explicit env override
            url = values.SQLALCHEMY_DATABASE_URL
            if url.startswith("sqlite") and os.path.isdir("/data"):
                # If the URL is exactly the default pointing at the app path, switch to /data
                # Accept both sqlite:/// and sqlite://// forms
                if "/booking.db" in url and "/data/booking.db" not in url:
                    values.SQLALCHEMY_DATABASE_URL = "sqlite:////data/booking.db"
        except Exception:
            # Defensive: never block app startup on this convenience logic
            pass
        return values

model_config = SettingsConfigDict(
    extra="forbid",
    env_file=os.getenv(
        "ENV_FILE", str(Path(__file__).resolve().parents[3] / ".env")
    ),
    case_sensitive=True,
)


def load_settings() -> "Settings":
    return Settings(_env_file=os.getenv("ENV_FILE", str(Path(__file__).resolve().parents[3] / ".env")))


settings = load_settings()


def _dedupe(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in seq:
        key = item.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        ordered.append(key)
    return ordered


_DEFAULT_FRONTEND_ORIGINS = [
    "https://booka.co.za",
    "https://www.booka.co.za",
]

_DEV_FRONTEND_FALLBACKS = [
    "http://localhost:3000",
    "http://localhost:5173",
]


def _collect_frontend_origins() -> list[str]:
    origins: list[str] = []
    origins.extend(_DEFAULT_FRONTEND_ORIGINS)
    try:
        cfg = getattr(settings, "FRONTEND_ORIGINS", []) or []
        origins.extend(cfg)
    except Exception:
        pass
    try:
        cors = getattr(settings, "CORS_ORIGINS", []) or []
        origins.extend(cors)
    except Exception:
        pass
    try:
        base = (getattr(settings, "FRONTEND_URL", "") or "").strip()
        if base:
            origins.append(base.rstrip("/"))
    except Exception:
        pass
    origins.extend(_DEV_FRONTEND_FALLBACKS)
    return _dedupe(origins)


FRONTEND_ORIGINS = _collect_frontend_origins()


def _primary_frontend() -> str:
    env_primary = os.getenv("FRONTEND_PRIMARY", "").strip()
    if env_primary:
        return env_primary.rstrip("/")
    try:
        cfg_primary = (getattr(settings, "FRONTEND_PRIMARY", "") or "").strip()
        if cfg_primary:
            return cfg_primary.rstrip("/")
    except Exception:
        pass
    try:
        frontend_url = (getattr(settings, "FRONTEND_URL", "") or "").strip()
        if frontend_url:
            return frontend_url.rstrip("/")
    except Exception:
        pass
    return "https://booka.co.za"


FRONTEND_PRIMARY = _primary_frontend()


def _cookie_domain() -> str | None:
    env_domain = os.getenv("COOKIE_DOMAIN", "").strip()
    if env_domain:
        return env_domain
    configured = (getattr(settings, "COOKIE_DOMAIN", "") or "").strip()
    if configured:
        return configured
    return ".booka.co.za"


COOKIE_DOMAIN = _cookie_domain()


def _redis_url() -> str:
    env_url = os.getenv("REDIS_URL")
    if env_url:
        return env_url
    return getattr(settings, "REDIS_URL", "redis://localhost:6379/0")


REDIS_URL = _redis_url()


def _google_client_id() -> str | None:
    env_client = os.getenv("GOOGLE_CLIENT_ID")
    if env_client:
        return env_client
    try:
        oauth_client = (getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or "").strip()
        if oauth_client:
            return oauth_client
    except Exception:
        pass
    return (getattr(settings, "GOOGLE_CLIENT_ID", "") or "").strip() or None


def _google_client_secret() -> str | None:
    env_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if env_secret:
        return env_secret
    try:
        oauth_secret = (getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "") or "").strip()
        if oauth_secret:
            return oauth_secret
    except Exception:
        pass
    return (getattr(settings, "GOOGLE_CLIENT_SECRET", "") or "").strip() or None


def _google_redirect_uri() -> str:
    env_redirect = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
    if env_redirect:
        return env_redirect
    env_alt = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if env_alt:
        return env_alt
    try:
        configured = (getattr(settings, "GOOGLE_OAUTH_REDIRECT_URI", "") or "").strip()
        if configured:
            return configured
    except Exception:
        pass
    return "https://api.booka.co.za/auth/google/callback"


GOOGLE_CLIENT_ID = _google_client_id()
GOOGLE_CLIENT_SECRET = _google_client_secret()
GOOGLE_REDIRECT_URI = _google_redirect_uri()
