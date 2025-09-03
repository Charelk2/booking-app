from pathlib import Path
from dotenv import load_dotenv
from unittest.mock import AsyncMock
import pytest

# Patch notifications broadcast for all tests
@pytest.fixture(autouse=True)
def patch_notifications_broadcast(monkeypatch):
    """Replace NotificationManager.broadcast with an AsyncMock."""
    mock = AsyncMock()
    monkeypatch.setattr(
        "app.utils.notifications.notifications_manager.broadcast",
        mock,
    )
    return mock

# Load environment variables for tests
load_dotenv(Path(__file__).resolve().parents[1] / '.env.test')
