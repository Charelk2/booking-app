from __future__ import annotations

from typing import Optional

from google import genai  # type: ignore
from google.genai import types  # type: ignore

from app.core.config import settings

_GENAI_CLIENT: Optional[genai.Client] = None


def get_genai_client() -> Optional[genai.Client]:
    """Return a process-wide Gemini client with a sensible HTTP timeout.

    This avoids recreating clients (and HTTP pools) on every request and gives
    us a hard per-request timeout so slow LLM calls cannot stall the agent.
    """
    global _GENAI_CLIENT
    api_key = (getattr(settings, "GOOGLE_GENAI_API_KEY", "") or "").strip()
    if not api_key:
        return None
    if _GENAI_CLIENT is None:
        _GENAI_CLIENT = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                client_args={
                    # Total HTTP timeout in seconds for each generate_content call.
                    # If the model or network is slower than this, the call will
                    # raise and the caller must fall back.
                    "timeout": 6.0,
                }
            ),
        )
    return _GENAI_CLIENT

