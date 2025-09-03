from fastapi.testclient import TestClient
from app.main import app
from app.models import User, UserType
from app.api.dependencies import get_current_active_client


def override_client():
    return User(
        id=1,
        email="test@example.com",
        password="x",
        first_name="Test",
        last_name="User",
        user_type=UserType.CLIENT,
        is_active=True,
    )



def test_booking_request_missing_artist_id():
    app.dependency_overrides[get_current_active_client] = override_client
    client = TestClient(app)
    response = client.post("/api/v1/booking-requests/", json={"message": "hi"})
    assert response.status_code == 422
    data = response.json()
    assert any(err["loc"][-1] == "artist_id" for err in data["detail"])
    app.dependency_overrides.clear()
