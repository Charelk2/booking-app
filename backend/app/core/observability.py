"""Observability helpers for logging and tracing.

Adds environment‑controlled knobs so local/dev runs can be quieter:

- LOG_LEVEL (default: INFO) — root logger level
- ENABLE_CONSOLE_TRACING (default: 1) — emit OTel spans to console
- OTEL_TRACES_SAMPLER_RATIO (default: 1.0) — trace sampling ratio (0.0–1.0)
- OTEL_EXCLUDED_URLS — comma‑separated URL patterns to exclude from tracing
- OTEL_EXCLUDE_WS (default: 0) — if set, exclude /api/v1/ws and /api/v1/sse
"""

from __future__ import annotations

import logging
import os

try:  # optional dependency for structured logs
    from pythonjsonlogger import jsonlogger  # type: ignore
    _HAS_JSONLOGGER = True
except Exception:  # pragma: no cover
    jsonlogger = None  # type: ignore
    _HAS_JSONLOGGER = False
from .config import settings
try:  # optional tracing setup
    from opentelemetry import trace  # type: ignore
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor  # type: ignore
    from opentelemetry.sdk.resources import Resource  # type: ignore
    from opentelemetry.sdk.trace import TracerProvider  # type: ignore
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter  # type: ignore
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased  # type: ignore
    _HAS_OTEL = True
except Exception:  # pragma: no cover
    _HAS_OTEL = False


def _parse_bool(value: str | bool | None, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def setup_logging() -> None:
    """Configure structured JSON logging."""
    handler = logging.StreamHandler()
    if _HAS_JSONLOGGER and jsonlogger is not None:
        formatter = jsonlogger.JsonFormatter("%(levelname)s %(name)s %(message)s")  # type: ignore[attr-defined]
    else:
        formatter = logging.Formatter("%(levelname)s %(name)s %(message)s")
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers = [handler]
    # Allow overriding the log level via env for quieter local runs
    # Prefer process env, then Settings fallback (loaded from .env)
    level_name = (os.getenv("LOG_LEVEL") or getattr(settings, "LOG_LEVEL", "INFO")).upper()
    level = getattr(logging, level_name, logging.INFO)
    root.setLevel(level)
    # Quiet Uvicorn's access logger (HTTP request lines) when not debugging
    try:
      access_logger = logging.getLogger("uvicorn.access")
      # Honor explicit env override if provided
      disable_access = _parse_bool(os.getenv("DISABLE_ACCESS_LOG"), level >= logging.WARNING)
      if disable_access:
          access_logger.handlers = []
          access_logger.propagate = False
          access_logger.disabled = True
      else:
          # Align to chosen level to reduce noise
          access_logger.setLevel(level)
    except Exception:
      pass


def setup_tracer(app) -> None:
    """Attach an OpenTelemetry tracer to the FastAPI app."""
    if not _HAS_OTEL:
        return
    resource = Resource(attributes={"service.name": "booking-api"})

    # Sampling ratio (0.0 – 1.0). Defaults to 1.0 to preserve previous behavior,
    # but can be lowered (e.g., 0.05) to reduce local noise.
    try:
        ratio_env = os.getenv("OTEL_TRACES_SAMPLER_RATIO")
        ratio = float(ratio_env) if ratio_env is not None else 1.0
        ratio = 0.0 if ratio < 0 else (1.0 if ratio > 1 else ratio)
    except Exception:
        ratio = 1.0

    provider = TracerProvider(
        resource=resource,
        sampler=ParentBased(TraceIdRatioBased(ratio)),
    )

    # Optional console exporter (enabled by default for parity with previous setup).
    env_enable = os.getenv("ENABLE_CONSOLE_TRACING")
    enable_console = _parse_bool(env_enable, getattr(settings, "ENABLE_CONSOLE_TRACING", True))
    if enable_console:
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)

    # Allow excluding noisy endpoints (e.g., websockets/SSE) from tracing
    excluded = [s.strip() for s in os.getenv("OTEL_EXCLUDED_URLS", "").split(",") if s.strip()]
    env_exclude_ws = os.getenv("OTEL_EXCLUDE_WS")
    exclude_ws = _parse_bool(env_exclude_ws, getattr(settings, "OTEL_EXCLUDE_WS", False))
    if exclude_ws:
        excluded.extend(["/api/v1/ws", "/api/v1/sse"])
    excluded_urls = ",".join(dict.fromkeys(excluded)) if excluded else None

    try:
        FastAPIInstrumentor.instrument_app(app, excluded_urls=excluded_urls)
    except TypeError:
        # Older versions may not support excluded_urls; fall back gracefully
        FastAPIInstrumentor.instrument_app(app)
