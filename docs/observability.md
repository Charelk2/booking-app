# Observability

This project emits structured logs and OpenTelemetry traces for both the FastAPI backend and the Next.js frontend.

## Logging
- **Backend**: Python logs are formatted as JSON using `python-json-logger`.
- **Frontend**: Uses the `pino` logger for structured output.
- HTTP 422 responses include detailed field errors to simplify debugging (e.g. missing `event_city`).

## Tracing
OpenTelemetry is configured with a console exporter. Spans include a `service.name` of either `booking-api` or `booking-frontend`.

To reduce local/dev noise you can tune tracing and logging via env vars:

- `LOG_LEVEL` (default `INFO`) — set to `WARNING` to quiet app logs.
- `ENABLE_CONSOLE_TRACING` (default `1`) — set to `0` to disable span export to the console.
- `OTEL_TRACES_SAMPLER_RATIO` (default `1.0`) — e.g., `0.05` to sample ~5% of requests.
- `OTEL_EXCLUDE_WS` (default `0`) — set to `1` to exclude websocket and SSE endpoints (`/api/v1/ws`, `/api/v1/sse`).
- `OTEL_EXCLUDED_URLS` — additional comma‑separated path patterns to skip (e.g., `/healthz,/metrics`).

Example (backend/.env or project .env):

```
LOG_LEVEL=WARNING
ENABLE_CONSOLE_TRACING=0
# Or keep tracing but sample aggressively and drop chatty realtime endpoints
# ENABLE_CONSOLE_TRACING=1
# OTEL_TRACES_SAMPLER_RATIO=0.05
# OTEL_EXCLUDE_WS=1
```

Tip: to reduce HTTP access lines from Uvicorn during local runs, start it with `--no-access-log` (or set `UVICORN_ACCESS_LOG=0`).

## Service Level Objectives
- **Error rate**: <1% of requests fail with 5xx responses.
- **Latency**: 95th percentile response time under 300ms.
- **Mobile LCP**: <2.5s largest contentful paint on coarse pointers.
- **Mobile INP**: <200ms interaction to next paint on coarse pointers.

## Alerts
When SLOs are breached, alerts should be sent to the on-call channel. Integration with a monitoring platform (e.g. Grafana or PagerDuty) is recommended.
Mobile web vitals events include viewport width and device pixel ratio to segment trends across devices. Tap errors and rage taps are tracked as additional quality signals, and any SLO regression generates a dedicated alert event.
