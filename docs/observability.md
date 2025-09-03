# Observability

This project emits structured logs and OpenTelemetry traces for both the FastAPI backend and the Next.js frontend.

## Logging
- **Backend**: Python logs are formatted as JSON using `python-json-logger`.
- **Frontend**: Uses the `pino` logger for structured output.
- HTTP 422 responses include detailed field errors to simplify debugging (e.g. missing `event_city`).

## Tracing
OpenTelemetry is configured with a console exporter. Spans include a `service.name` of either `booking-api` or `booking-frontend`.

## Service Level Objectives
- **Error rate**: <1% of requests fail with 5xx responses.
- **Latency**: 95th percentile response time under 300ms.
- **Mobile LCP**: <2.5s largest contentful paint on coarse pointers.
- **Mobile INP**: <200ms interaction to next paint on coarse pointers.

## Alerts
When SLOs are breached, alerts should be sent to the on-call channel. Integration with a monitoring platform (e.g. Grafana or PagerDuty) is recommended.
Mobile web vitals events include viewport width and device pixel ratio to segment trends across devices. Tap errors and rage taps are tracked as additional quality signals, and any SLO regression generates a dedicated alert event.
