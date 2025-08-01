from __future__ import annotations

from datetime import datetime
from unittest.mock import Mock

import pytest
from google.oauth2.credentials import Credentials

from app.services import calendar_service


class DummyFlow:
    """Simplified OAuth flow returning fixed credentials."""

    def __init__(self) -> None:
        self.credentials = Credentials(
            token="at",
            refresh_token="rt",
            token_uri="u",
            client_id="id",
            client_secret="sec",
        )
        self.credentials.expiry = datetime.utcnow()

    def fetch_token(self, code: str) -> None:  # noqa: D401 - part of mock
        """Mock fetch_token that does nothing."""
        return None


@pytest.fixture
def google_dummy_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch ``calendar_service._flow`` to return :class:`DummyFlow`."""

    monkeypatch.setattr(
        calendar_service, "_flow", lambda uri, flow_cls=calendar_service.Flow: DummyFlow()
    )


# Fixtures for tests can import google_dummy_flow to patch the OAuth flow.
