import os

from fastapi.openapi.utils import get_openapi
from dotenv import load_dotenv
from app.main import app

# Load environment variables for development and tests
load_dotenv()  # This reads .env into os.environ


def custom_openapi() -> dict:
    """Return OpenAPI schema with project metadata."""
    if app.openapi_schema:
        return app.openapi_schema
    app.openapi_schema = get_openapi(
        title="Artist Booking API",
        version="1.0.0",
        description=("API for managing artist bookings, payments, and notifications."),
        contact={"name": "Artist Booking Support", "email": "support@example.com"},
        routes=app.routes,
    )
    return app.openapi_schema


app.openapi = custom_openapi

if __name__ == "__main__":
    import uvicorn

    workers = int(os.getenv("UVICORN_WORKERS", "1"))
    keepalive = int(os.getenv("UVICORN_KEEPALIVE", "65"))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        workers=workers,
        timeout_keep_alive=keepalive,
    )
