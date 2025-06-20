from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator
from typing import Any, ClassVar
import json
from pathlib import Path


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

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/google-calendar/callback"

    # Base frontend URL used for OAuth redirects
    FRONTEND_URL: str = "http://localhost:3000"

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


    @model_validator(mode="after")
    def allow_all_if_requested(cls, values: "Settings") -> "Settings":
        if values.CORS_ALLOW_ALL:
            values.CORS_ORIGINS = ["*"]
        return values

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
