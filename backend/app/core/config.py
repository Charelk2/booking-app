from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"

    # JWT configuration (provide a fallback for local development)
    SECRET_KEY: str = "fallback_secret_for_dev_only"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Database URL
    SQLALCHEMY_DATABASE_URL: str = "sqlite:///./booking.db"

    # CORS origins
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
