import re
import secrets
from typing import Optional

from starlette.responses import Response

from app.core.config import COOKIE_DOMAIN

SAFE_NEXT_RE = re.compile(r"^/[a-zA-Z0-9\-._~/]*(\?[a-zA-Z0-9\-._~&=%]*)?$")


def new_oauth_state() -> str:
    """Return a cryptographically secure OAuth state token."""
    return secrets.token_urlsafe(24)


def sanitize_next(next_path: Optional[str]) -> str:
    """Limit redirects to safe, relative in-app paths."""
    if not next_path:
        return "/"
    if not isinstance(next_path, str):
        return "/"
    candidate = next_path.strip()
    if not candidate:
        return "/"
    if not SAFE_NEXT_RE.match(candidate):
        return "/"
    return candidate


def set_session_cookie(response: Response, name: str, value: str, max_age: int = 30 * 24 * 60 * 60) -> None:
    """Set a cross-site-friendly session cookie on the callback response."""
    if not name:
        raise ValueError("Cookie name is required")
    cookie_domain = COOKIE_DOMAIN or None
    response.set_cookie(
        key=name,
        value=value,
        domain=cookie_domain,
        path="/",
        secure=True,
        httponly=True,
        samesite="none",
        max_age=max_age,
    )


__all__ = ["new_oauth_state", "sanitize_next", "set_session_cookie", "SAFE_NEXT_RE"]
