from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import StreamingResponse, RedirectResponse
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


def _has_required_presign_params(u: str) -> bool:
    try:
        # Basic presigned URL sanity checks without fetching headers
        if "X-Amz-Algorithm=" not in u or "X-Amz-Signature=" not in u:
            return False
        return True
    except Exception:
        return False


# Shared HTTP client (keepalive + limits) for streaming mode
_CLIENT = httpx.AsyncClient(
    follow_redirects=True,
    timeout=httpx.Timeout(30.0, connect=10.0),
    limits=httpx.Limits(max_connections=200, max_keepalive_connections=100),
)

@router.get("/attachments/proxy")
async def proxy_attachment(
    request: Request,
    u: str = Query(..., description="Absolute URL to the upstream media (http/https)"),
    mode: str = Query("redirect", description="redirect (default) or stream"),
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
        if parsed.scheme != "https":
            return Response(status_code=status.HTTP_400_BAD_REQUEST)
        if not _allowed_host(parsed.netloc):
            return Response(status_code=status.HTTP_403_FORBIDDEN)
        # Validate basic presign parameters to prevent SSRF to arbitrary hosts
        if not _has_required_presign_params(u):
            return Response(status_code=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    # Preferred pattern: validate, then 302 redirect so browsers fetch bytes directly
    if (mode or "").lower() != "stream":
        return RedirectResponse(url=u, status_code=status.HTTP_302_FOUND)

    headers = {}
    # Forward Range for partial content support
    rng = request.headers.get("range")
    if rng:
        headers["Range"] = rng

    # Do not forward cookies/Authorization; upstream is public
    attempts = 0
    last_exc: Exception | None = None
    while attempts < 3:
        attempts += 1
        try:
            upstream = await _CLIENT.stream("GET", u, headers=headers)
            # If upstream returns an error, pass it through with a short body, do not mask as 502
            if upstream.status_code >= 400 and upstream.status_code not in (304,):
                body = await upstream.aread()
                # Relay upstream error status and a trimmed body
                relay_error_headers = {}
                ct_err = upstream.headers.get("content-type")
                if ct_err:
                    relay_error_headers["Content-Type"] = ct_err
                return Response(
                    content=body[:512],
                    status_code=upstream.status_code,
                    headers=relay_error_headers,
                )

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

            # Content-Type allowlist: audio/*, image/*, application/pdf (skip for 304)
            if upstream.status_code != 304 and not _allowed_content_type(ct):
                await upstream.aclose()
                return Response(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

            # Partial/conditional support
            ar = upstream.headers.get("accept-ranges")
            if ar:
                relay_headers["Accept-Ranges"] = ar
            cr = upstream.headers.get("content-range")
            if cr:
                relay_headers["Content-Range"] = cr
            etag = upstream.headers.get("etag")
            if etag:
                relay_headers["ETag"] = etag
            lm = upstream.headers.get("last-modified")
            if lm:
                relay_headers["Last-Modified"] = lm
            # Respect upstream cache-control, or set long-lived public cache for immutable presigned URLs
            if "cache-control" in upstream.headers:
                relay_headers["Cache-Control"] = upstream.headers.get("cache-control")
            else:
                relay_headers["Cache-Control"] = "public, max-age=31536000, immutable"

            # 304 Not Modified carries no body
            if upstream.status_code == 304:
                await upstream.aclose()
                return Response(status_code=304, headers=relay_headers)

            return StreamingResponse(
                upstream.aiter_raw(),
                status_code=upstream.status_code,
                headers=relay_headers,
            )
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.RemoteProtocolError) as exc:
            last_exc = exc
            continue
        except Exception as exc:  # unexpected client error
            logger.warning("Attachment proxy error: %s", exc)
            last_exc = exc
            break

    logger.warning("Attachment proxy upstream failed after retries: %s", last_exc)
    return Response(status_code=status.HTTP_502_BAD_GATEWAY)
