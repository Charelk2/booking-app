from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Any
import json


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"

    # JWT configuration (provide a fallback for local development)
    SECRET_KEY: str = "fallback_secret_for_dev_only"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Database URL
    SQLALCHEMY_DATABASE_URL: str = "sqlite:///./booking.db"

    # Redis connection URL for caching
    REDIS_URL: str = "redis://localhost:6379/0"

    # CORS origins
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3002"]

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

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
