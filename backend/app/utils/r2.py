from __future__ import annotations

import os
import uuid
import datetime as dt
from typing import Optional, Tuple

try:  # optional for OpenAPI/minimal envs
    import boto3  # type: ignore
    from botocore.config import Config  # type: ignore
    _HAS_BOTO3 = True
except Exception:  # pragma: no cover - optional dependency path
    boto3 = None  # type: ignore
    Config = None  # type: ignore
    _HAS_BOTO3 = False
 


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
        # If not explicitly provided, fall back to the path-style base using
        # the S3 endpoint plus the bucket (e.g., https://<acct>.r2.cloudflarestorage.com/<bucket>)
        _public = (_env("R2_PUBLIC_BASE_URL") or "").rstrip("/")
        if not _public and self.endpoint_url and self.bucket:
            _public = f"{self.endpoint_url.rstrip('/')}/{self.bucket}"
        self.public_base_url = _public
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
    if not _HAS_BOTO3:
        raise RuntimeError("boto3 not available for R2 client")
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


def _build_avatar_key(user_id: int, filename: Optional[str], content_type: Optional[str]) -> str:
    now = dt.datetime.utcnow()
    y = now.strftime("%Y")
    m = now.strftime("%m")
    uid = uuid.uuid4().hex
    ext = guess_extension(filename, content_type)
    return f"avatars/{int(user_id)}/{y}/{m}/{uid}{ext}"


def presign_put_avatar(user_id: int, filename: Optional[str], content_type: Optional[str]) -> dict:
    """Presign a direct R2 upload URL for a user's avatar.

    Returns a dict with the same shape as ``presign_put``.
    Key format: avatars/{user_id}/{yyyy}/{mm}/{uuid}{ext}
    """
    cfg = R2Config()
    if not cfg.is_configured():
        raise RuntimeError("R2 is not configured")
    key = _build_avatar_key(user_id, filename, content_type)
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
    # No need for GET presign for avatars; prefer the stable public URL
    public_url = f"{cfg.public_base_url}/{key}" if cfg.public_base_url else None
    return {
        "key": key,
        "put_url": put_url,
        "get_url": None,
        "public_url": public_url,
        "headers": {k: v for k, v in ([("Content-Type", content_type)] if content_type else [])},
        "upload_expires_in": cfg.upload_ttl_seconds,
        "download_expires_in": cfg.download_ttl_seconds,
    }


def _build_user_scoped_key(prefix: str, user_id: int, filename: Optional[str], content_type: Optional[str]) -> str:
    now = dt.datetime.utcnow()
    y = now.strftime("%Y")
    m = now.strftime("%m")
    uid = uuid.uuid4().hex
    ext = guess_extension(filename, content_type)
    p = prefix.strip('/').lower()
    return f"{p}/{int(user_id)}/{y}/{m}/{uid}{ext}"


def presign_put_cover(user_id: int, filename: Optional[str], content_type: Optional[str]) -> dict:
    cfg = R2Config()
    if not cfg.is_configured():
        raise RuntimeError("R2 is not configured")
    key = _build_user_scoped_key('cover_photos', user_id, filename, content_type)
    client = _client(cfg)
    params = {"Bucket": cfg.bucket, "Key": key}
    if content_type:
        params["ContentType"] = content_type
    put_url = client.generate_presigned_url("put_object", Params=params, ExpiresIn=cfg.upload_ttl_seconds)
    public_url = f"{cfg.public_base_url}/{key}" if cfg.public_base_url else None
    return {
        "key": key,
        "put_url": put_url,
        "get_url": None,
        "public_url": public_url,
        "headers": {k: v for k, v in ([("Content-Type", content_type)] if content_type else [])},
        "upload_expires_in": cfg.upload_ttl_seconds,
        "download_expires_in": cfg.download_ttl_seconds,
    }


def presign_put_portfolio(user_id: int, filename: Optional[str], content_type: Optional[str]) -> dict:
    cfg = R2Config()
    if not cfg.is_configured():
        raise RuntimeError("R2 is not configured")
    key = _build_user_scoped_key('portfolio_images', user_id, filename, content_type)
    client = _client(cfg)
    params = {"Bucket": cfg.bucket, "Key": key}
    if content_type:
        params["ContentType"] = content_type
    put_url = client.generate_presigned_url("put_object", Params=params, ExpiresIn=cfg.upload_ttl_seconds)
    public_url = f"{cfg.public_base_url}/{key}" if cfg.public_base_url else None
    return {
        "key": key,
        "put_url": put_url,
        "get_url": None,
        "public_url": public_url,
        "headers": {k: v for k, v in ([("Content-Type", content_type)] if content_type else [])},
        "upload_expires_in": cfg.upload_ttl_seconds,
        "download_expires_in": cfg.download_ttl_seconds,
    }


def presign_put_service_media(user_id: int, filename: Optional[str], content_type: Optional[str]) -> dict:
    cfg = R2Config()
    if not cfg.is_configured():
        raise RuntimeError("R2 is not configured")
    key = _build_user_scoped_key('media', user_id, filename, content_type)
    client = _client(cfg)
    params = {"Bucket": cfg.bucket, "Key": key}
    if content_type:
        params["ContentType"] = content_type
    put_url = client.generate_presigned_url("put_object", Params=params, ExpiresIn=cfg.upload_ttl_seconds)
    public_url = f"{cfg.public_base_url}/{key}" if cfg.public_base_url else None
    return {
        "key": key,
        "put_url": put_url,
        "get_url": None,
        "public_url": public_url,
        "headers": {k: v for k, v in ([("Content-Type", content_type)] if content_type else [])},
        "upload_expires_in": cfg.upload_ttl_seconds,
        "download_expires_in": cfg.download_ttl_seconds,
    }
