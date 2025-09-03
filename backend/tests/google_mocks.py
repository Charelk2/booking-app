from __future__ import annotations

from datetime import datetime

import pytest
from app.services import calendar_service
from google.oauth2.credentials import Credentials


def make_dummy_credentials(refresh_token: str | None = "rt") -> Credentials:
    """Return credentials suitable for mocking OAuth interactions."""

    creds = Credentials(
        token="at",
        refresh_token=refresh_token,
        token_uri="u",
        client_id="id",
        client_secret="sec",
    )
    creds.expiry = datetime.utcnow()
    return creds


class DummyFlow:
    """Simplified OAuth flow returning fixed credentials."""

    def __init__(self, *, refresh_token: str | None = "rt") -> None:
        self.credentials = make_dummy_credentials(refresh_token)

    def fetch_token(self, code: str) -> None:  # noqa: D401 - part of mock
        """Mock fetch_token that does nothing."""
        return None


@pytest.fixture
def google_dummy_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch ``calendar_service._flow`` to return :class:`DummyFlow`."""

    monkeypatch.setattr(
        calendar_service,
        "_flow",
        lambda uri, flow_cls=calendar_service.Flow: DummyFlow(),
    )


# Fixtures for tests can import google_dummy_flow to patch the OAuth flow.
