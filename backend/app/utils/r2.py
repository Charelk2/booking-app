from __future__ import annotations

import os
import uuid
import datetime as dt
from typing import Optional, Tuple

import boto3
from botocore.config import Config
import tempfile
import subprocess
import os as _os
from urllib.parse import urlparse


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name, default)
    return v.strip() if isinstance(v, str) else v


class R2Config:
    def __init__(self) -> None:
        self.account_id = _env("R2_ACCOUNT_ID")
        self.access_key_id = _env("R2_ACCESS_KEY_ID")
        self.secret_access_key = _env("R2_SECRET_ACCESS_KEY")
        self.bucket = _env("R2_BUCKET")
        # Example: https://9bd...d91c.r2.cloudflarestorage.com (or EU endpoint)
        self.endpoint_url = _env("R2_S3_ENDPOINT") or (
            f"https://{self.account_id}.r2.cloudflarestorage.com" if self.account_id else None
        )
        # Public custom domain used to reference objects (no signature)
        self.public_base_url = (_env("R2_PUBLIC_BASE_URL") or "").rstrip("/")
        # TTLs
        self.upload_ttl_seconds = int(_env("R2_PRESIGN_UPLOAD_TTL", "3600") or 3600)  # 1h
        # Keep download TTL short for playback URLs (default 30 minutes).
        # Can be extended via R2_PRESIGN_DOWNLOAD_TTL if required.
        self.download_ttl_seconds = int(_env("R2_PRESIGN_DOWNLOAD_TTL", str(30 * 60)) or (30 * 60))

    def is_configured(self) -> bool:
        return bool(self.bucket and self.endpoint_url and self.access_key_id and self.secret_access_key)


def _client(cfg: R2Config):
    """Create an S3 client configured for Cloudflare R2.

    Important bits:
    - signature_version s3v4 (required for presigned URLs)
    - region "auto" (R2 requirement)
    - path-style addressing (virtual-hosted style is not supported the same way)
    - endpoint_url MUST match the host you will call (eu vs non-eu)
    """
    return boto3.client(
        "s3",
        aws_access_key_id=cfg.access_key_id,
        aws_secret_access_key=cfg.secret_access_key,
        endpoint_url=cfg.endpoint_url,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )


def guess_extension(filename: Optional[str], content_type: Optional[str]) -> str:
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].strip().lower()
        if ext:
            return "." + ext
    if content_type:
        ct = content_type.lower()
        mapping = {
            "audio/m4a": ".m4a",
            "audio/mp4": ".m4a",
            "audio/aac": ".aac",
            "audio/mpeg": ".mp3",
            "audio/ogg": ".ogg",
            "audio/wav": ".wav",
            "video/mp4": ".mp4",
            "video/webm": ".webm",
            "image/heic": ".heic",
            "image/heif": ".heif",
            "image/avif": ".avif",
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
        }
        return mapping.get(ct, "")
    return ""


def build_key(kind: str, booking_id: int, filename: Optional[str], content_type: Optional[str]) -> str:
    kind = (kind or "file").strip().lower()
    base = {
        "voice": "voice-notes",
        "audio": "voice-notes",
        "video": "videos",
        "image": "images",
        "file": "files",
    }.get(kind, "files")
    now = dt.datetime.utcnow()
    y = now.strftime("%Y")
    m = now.strftime("%m")
    uid = uuid.uuid4().hex
    ext = guess_extension(filename, content_type)
    return f"{base}/{booking_id}/{y}/{m}/{uid}{ext}"


def presign_put(kind: str, booking_id: int, filename: Optional[str], content_type: Optional[str]) -> dict:
    cfg = R2Config()
    if not cfg.is_configured():
        raise RuntimeError("R2 is not configured")
    key = build_key(kind, booking_id, filename, content_type)
    client = _client(cfg)
    params = {
        "Bucket": cfg.bucket,
        "Key": key,
    }
    if content_type:
        params["ContentType"] = content_type
    put_url = client.generate_presigned_url(
        ClientMethod="put_object",
        Params=params,
        ExpiresIn=cfg.upload_ttl_seconds,
    )
    # Provide a convenience signed GET for immediate preview
    get_url = client.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": cfg.bucket, "Key": key},
        ExpiresIn=cfg.download_ttl_seconds,
    )
    public_url = f"{cfg.public_base_url}/{key}" if cfg.public_base_url else None
    return {
        "key": key,
        "put_url": put_url,
        "get_url": get_url,
        "public_url": public_url,
        "headers": {k: v for k, v in ([("Content-Type", content_type)] if content_type else [])},
        "upload_expires_in": cfg.upload_ttl_seconds,
        "download_expires_in": cfg.download_ttl_seconds,
    }


def presign_get_for_public_url(public_url: str) -> Optional[str]:
    """If ``public_url`` points to the configured public base and bucket, return a presigned GET URL.
    Otherwise return None.
    """
    cfg = R2Config()
    base = (cfg.public_base_url or "").rstrip("/")
    if not (cfg.is_configured() and base and public_url and public_url.startswith(base + "/")):
        return None
    key = public_url[len(base) + 1 :]
    client = _client(cfg)
    return client.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": cfg.bucket, "Key": key},
        ExpiresIn=cfg.download_ttl_seconds,
    )


def _key_from_url(url: str) -> Optional[str]:
    """Best-effort extract of R2 object key from either public or S3 endpoint URL."""
    try:
        cfg = R2Config()
        u = urlparse(url)
        if not u.scheme:
            return None
        # Public base
        base = (cfg.public_base_url or '').rstrip('/')
        if base and url.startswith(base + '/'):
            return url[len(base) + 1:]
        # S3 path-style: https://endpoint/bucket/key
        if cfg.bucket and u.path:
            parts = u.path.lstrip('/').split('/', 1)
            if len(parts) == 2 and parts[0] == cfg.bucket:
                return parts[1]
        return None
    except Exception:
        return None


def transcode_webm_to_m4a(public_or_s3_url: str) -> Optional[dict]:
    """Transcode a webm voice note to m4a (AAC) and upload to R2.

    Returns dict with keys: { 'key': str, 'public_url': str | None }
    or None on failure.
    """
    cfg = R2Config()
    if not cfg.is_configured():
        return None
    key = _key_from_url(public_or_s3_url)
    if not key:
        return None
    client = _client(cfg)
    # Download source to temp
    with tempfile.TemporaryDirectory() as td:
        src = _os.path.join(td, 'in.webm')
        dst = _os.path.join(td, 'out.m4a')
        try:
            obj = client.get_object(Bucket=cfg.bucket, Key=key)
            with open(src, 'wb') as f:
                for chunk in obj['Body'].iter_chunks():
                    if chunk:
                        f.write(chunk)
        except Exception:
            return None
        # ffmpeg transcode: webm/opus -> m4a/aac
        try:
            subprocess.run(
                ['ffmpeg', '-y', '-i', src, '-c:a', 'aac', '-b:a', '64k', dst],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            return None
        # Upload to compat key alongside original
        base, ext = _os.path.splitext(key)
        compat_key = f"{base}.m4a"
        try:
            with open(dst, 'rb') as f:
                client.put_object(
                    Bucket=cfg.bucket,
                    Key=compat_key,
                    Body=f,
                    ContentType='audio/mp4',
                )
        except Exception:
            return None
        pub = f"{cfg.public_base_url}/{compat_key}" if cfg.public_base_url else None
        return {'key': compat_key, 'public_url': pub}
