from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from typing import Optional
import httpx
from urllib.parse import urlparse
import logging
import os


router = APIRouter(tags=["attachments"])

logger = logging.getLogger(__name__)


def _allowed_host(netloc: str) -> bool:
    host = (netloc or "").lower()
    # Allow Cloudflare R2 public endpoints (bucket subdomains)
    if host.endswith(".r2.cloudflarestorage.com"):
        return True
    # Optional allowlist via env: comma-separated hosts
    extra = (os.getenv("ATTACHMENTS_PROXY_ALLOWED_HOSTS") or "").strip()
    if extra:
        for h in [p.strip().lower() for p in extra.split(",") if p.strip()]:
            if host == h or host.endswith("." + h):
                return True
    # Future: allow additional hosts via env/config
    return False


def _allowed_content_type(ct: str | None) -> bool:
    if not ct:
        return False
    val = ct.split(";")[0].strip().lower()
    if val.startswith("audio/"):
        return True
    if val.startswith("image/"):
        return True
    if val == "application/pdf":
        return True
    return False


@router.get("/attachments/proxy")
async def proxy_attachment(
    request: Request,
    u: str = Query(..., description="Absolute URL to the upstream media (http/https)"),
):
    """Stream an upstream attachment through same-origin to avoid CORS issues.

    - Only permits whitelisted hosts (e.g., Cloudflare R2 public endpoints)
    - Forwards Range requests to support audio/video scrubbing
    - Relays relevant headers (Content-Type, Content-Length, Accept-Ranges, Content-Range, ETag, Last-Modified)
    - Adds conservative public caching
    """
    try:
        parsed = urlparse(u)
        if parsed.scheme not in ("http", "https"):
            return Response(status_code=status.HTTP_400_BAD_REQUEST)
        if not _allowed_host(parsed.netloc):
            return Response(status_code=status.HTTP_403_FORBIDDEN)
    except Exception:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    headers = {}
    # Forward Range for partial content support
    rng = request.headers.get("range")
    if rng:
        headers["Range"] = rng

    # Do not forward cookies/Authorization; upstream is public
    async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
        try:
            upstream = await client.stream("GET", u, headers=headers)
        except Exception as exc:
            logger.warning("Attachment proxy error: %s", exc)
            return Response(status_code=status.HTTP_502_BAD_GATEWAY)

        # Map headers to relay
        relay_headers = {}
        # Content type & length
        ct = upstream.headers.get("content-type")
        if ct:
            relay_headers["Content-Type"] = ct
        cl = upstream.headers.get("content-length")
        if cl:
            relay_headers["Content-Length"] = cl
        # Enforce basic safety limits
        try:
            max_mb = float(os.getenv("ATTACHMENTS_PROXY_MAX_MB", "50"))
        except Exception:
            max_mb = 50.0
        try:
            if cl and max_mb > 0 and float(cl) > max_mb * 1024 * 1024:
                await upstream.aclose()
                return Response(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        except Exception:
            pass

        # Content-Type allowlist: audio/*, image/*, application/pdf
        if not _allowed_content_type(ct):
            await upstream.aclose()
            return Response(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
        # Partial content support
        ar = upstream.headers.get("accept-ranges")
        if ar:
            relay_headers["Accept-Ranges"] = ar
        cr = upstream.headers.get("content-range")
        if cr:
            relay_headers["Content-Range"] = cr
        # Caching hints
        etag = upstream.headers.get("etag")
        if etag:
            relay_headers["ETag"] = etag
        lm = upstream.headers.get("last-modified")
        if lm:
            relay_headers["Last-Modified"] = lm
        # Avoid private set by upstream; use public cache unless headers say otherwise
        if "cache-control" in upstream.headers:
            relay_headers["Cache-Control"] = upstream.headers.get("cache-control")
        else:
            relay_headers["Cache-Control"] = "public, max-age=3600"

        return StreamingResponse(
            upstream.aiter_raw(),
            status_code=upstream.status_code,
            headers=relay_headers,
        )
