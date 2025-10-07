## Project Inbox – Realtime, Stability, and Composer UX

This document captures the Inbox runtime architecture and the stability hardening applied across chat, notifications, and previews.

### Realtime Architecture

- Single connection: A global `RealtimeProvider` creates exactly one WS (or SSE) connection app‑wide and multiplexes topics (e.g., `thread:{id}`, `notifications`).
- Keepalive: Client sends a small `ping` every ~25s to reduce idle proxy closes; server heartbeats are also supported.
- Backoff/fallback: On repeated WS failures, fallback to SSE after a few attempts; reconnect strategy is jittered exponential backoff.
- Topic lifecycle: Subscriptions are sent on open; changes in active topics refresh the SSE stream when in fallback mode.

### Transport Stability

- No per‑instance pinning: The client does not send `Fly-Prefer-Instance` and clears any legacy pin state on load. For transient 5xx or timeouts, the request is retried once without pinning.
- Unread badge: Uses a tiny `/inbox/unread` endpoint with ETag; falls back to preview aggregation when needed.
- Infra runbook:
  - Run ≥2 instances during deploys and steady state.
  - Rolling deploys; health checks pass only when the app is fully ready (DB connections, caches, media proxy).
  - Optional: strip `Fly-Prefer-Instance` at the edge as a belt‑and‑braces rule.

### Composer UX (low‑risk look & feel)

- Mic ↔ Send: Exactly one control is visible at a time. Send animates in when text or attachments are present; mic is shown otherwise and turns red while recording.
- Anchoring: While anchored to bottom, the last message remains visible as the textarea grows (up to 10 lines) and when attachment/voice‑note previews appear.
- iOS tweaks: Input is zoom‑safe; audio uploads avoid unsigned `Content-Type` for Safari/R2 signature stability.

### Inline Quote Handling

- Suppression: Once a quote is sent in a thread, the inline quote composer is permanently suppressed for that thread (persisted in localStorage) to avoid flicker on refresh.
- Hydration gate: The inline editor renders only after the initial messages fetch completes to avoid transient flashes during hydration.

### Files of Interest

- Provider: `frontend/src/contexts/RealtimeContext.tsx`
- Hook: `frontend/src/hooks/useRealtime.ts`
- Consumers: `frontend/src/hooks/useNotifications.tsx`, `frontend/src/hooks/useUnreadThreadsCount.ts`, `frontend/src/components/booking/MessageThread.tsx`
- HTTP client (stability): `frontend/src/lib/api.ts`

