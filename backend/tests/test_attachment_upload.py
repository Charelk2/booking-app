from fastapi.testclient import TestClient
from app.main import app
from app.models import User, UserType
from app.api.dependencies import get_current_user


def override_user():
    return User(
        id=1,
        email="test@example.com",
        password="x",
        first_name="Test",
        last_name="User",
        user_type=UserType.CLIENT,
        is_active=True,
    )


def test_missing_file_attachment_returns_clear_error():
    app.dependency_overrides[get_current_user] = override_user
    client = TestClient(app)
    response = client.post("/api/v1/booking-requests/1/attachments")
    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "message": "No file provided",
            "field_errors": {"file": "required"},
        }
    }
    app.dependency_overrides.clear()
