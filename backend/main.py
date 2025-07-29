from fastapi.openapi.utils import get_openapi
from app.main import app


def custom_openapi() -> dict:
    """Return OpenAPI schema with project metadata."""
    if app.openapi_schema:
        return app.openapi_schema
    app.openapi_schema = get_openapi(
        title="Artist Booking API",
        version="1.0.0",
        description=(
            "API for managing artist bookings, payments, and notifications."
        ),
        contact={"name": "Artist Booking Support", "email": "support@example.com"},
        routes=app.routes,
    )
    return app.openapi_schema


app.openapi = custom_openapi

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
