# Performance Baseline

This document captures initial performance metrics for the booking application.

## API Latency

| Route | p50 Latency | p95 Latency | Payload Size |
|-------|-------------|-------------|-------------|
| `/` | 4.19 ms | 5.72 ms | 43 B |
| `/api/v1/travel-forecast?location=Cape%20Town` | 803.65 ms | 1777.60 ms | 20,465 B |

TTFB for `/` measured via `curl` was 2.4 ms.

## WebSocket

Connecting to `/ws/notifications` without credentials resulted in immediate closure. Connection attempts showed p50 of 2.44 ms and p95 of 28.13 ms to rejection.

## Frontend Build & Web Vitals

`next build` currently fails due to TypeScript errors in `src/app/dashboard/client/page.tsx`, preventing bundle size and Web Vitals measurements.

## Notes

These values serve as a starting point for future optimization work.

## Mobile Performance Budgets

The CI pipeline enforces basic mobile DOMContentLoaded budgets:

| Route | Budget (ms) |
|-------|-------------|
| `/` | 2000 |
| `/booking?service_provider_id=1&service_id=1` | 3000 |
