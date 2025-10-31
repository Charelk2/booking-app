Chat Realtime Tail Render — Sacred Path
=======================================

This document captures the root cause, the fixes, and the “do not break”
invariants for the chat realtime tail rendering path. These parts are sacred —
changing them carelessly will reintroduce the bug where the newest message does
not appear immediately in the open thread, even though the list preview updates.

Summary
-------

- Symptom: The newest message often failed to render at the bottom of the open
  thread. The conversation preview (left pane) updated quickly, but the chat
  viewport lagged or showed the second‑last message as the tail.
- Root cause: The newest WS “message” sometimes arrived with a stale or missing
  timestamp, causing sorting to place it above the tail. System booking‑details
  summaries were also hidden. On the client side (recipient), notifications
  sometimes beat the WS echo, and the thread waited for the echo to render.
- Fixes (sacred invariants):
  1) Monotonic tail placement — newest id must render at tail immediately.
  2) Timestamp “now” fallback for missing/invalid values.
  3) Do not hide booking‑details system tails.
  4) Append a minimal synthetic bubble on `thread_tail` realtime events.
  5) Poke a tiny after_id delta reconcile after WS events and after
     notifications for the active thread.
  6) Calm WS error handling to avoid subscribe/unsubscribe thrash.

Sacred Files & What They Do
---------------------------

- frontend/src/components/chat/MessageThread/hooks/useThreadData.ts
  - Monotonic tail bump in `ingestExternalMessage`: if `incoming.id` is strictly
    greater than any known id, coerce `incoming.timestamp` to be ≥ current tail
    timestamp so the newest bubble is guaranteed to render at the bottom.
  - Timestamp fallback: when normalization cannot derive a valid timestamp, use
    `new Date().toISOString()` instead of epoch.
  - Delta reconcile: `fetchDelta()` performs a tiny after_id fetch (mode=delta)
    and merges new rows; throttled via `deltaCooldownRef` to avoid spam.
  - Global poke listener: reacts to `thread:pokedelta` (e.g., from
    notifications) and runs `fetchDelta('poked')` for the active thread.
  - DO NOT remove: monotonic tail logic, timestamp fallback, `fetchDelta`, or
    the `thread:pokedelta` listener.

- frontend/src/components/chat/MessageThread/hooks/useThreadRealtime.ts
  - WS handler appends a minimal synthetic bubble on `type: 'thread_tail'` so
    the open thread shows the latest immediately while the echo lands.
  - After `type: 'message'` and after `thread_tail`, calls `pokeDelta()` to
    nudge a quick delta reconcile.
  - DO NOT remove: synthetic injection on `thread_tail` and the delta poke.

- frontend/src/hooks/useNotifications.tsx
  - On NEW_MESSAGE for the active thread, adds an ephemeral stub and dispatches
    `thread:pokedelta` to trigger an immediate delta reconcile. This makes the
    client (recipient) as snappy as the provider when notification beats WS.
  - DO NOT remove: the `thread:pokedelta` dispatch for active thread.

- frontend/src/components/chat/MessageThread/message/SystemMessage.tsx
  - Booking details summaries are NOT hidden anymore. Renders a compact
    “New booking request — Review details” card to keep the tail visible.
  - DO NOT revert: avoiding `return null` for booking‑detail summaries.

- frontend/src/hooks/useRealtime.ts
  - onerror: logs the error and lets `onclose` handle backoff. This reduces
    subscribe/unsubscribe thrash (previously onerror closed and onclose also
    scheduled reconnects).
  - DO NOT change this back to “close in onerror”.

- frontend/src/components/chat/MessageThread/index.web.tsx
  - Wires `fetchDelta` from `useThreadData` into `useThreadRealtime` via
    `pokeDelta`. Keep this plumbing in place.

Why These Invariants Matter
---------------------------

- Monotonic tail: latest id trumps timestamp drift. Without it, a stale/missing
  timestamp can place the newest bubble far above the tail.
- Timestamp fallback: no epoch sorting artifacts for new messages.
- Synthetic `thread_tail`: the preview arrives first; the user must see a tail
  bubble immediately even before the echo.
- Delta reconcile: if the UI didn’t visibly update from realtime alone, a tiny
  after_id fetch forces parity.
- Visible system tails: booking details should never create an invisible tail.
- Calmer WS: minimizes reconnect loops that delay delivery.

Do/Don’t
---------

- DO:
  - Keep the tail bump and “now” fallback logic exactly as is.
  - Keep delta reconcile and its throttle.
  - Keep the `thread:pokedelta` path (notifications → listener → fetchDelta).
  - Keep the `thread_tail` synthetic injection.
  - Keep WS onerror logging-only behavior; let onclose schedule backoff.

- DON’T:
  - Remove the timestamp bump or fallback; it will resurrect the “second‑last
    appears as last” bug.
  - Hide booking‑detail system messages inline; it creates “missing” tails.
  - Remove the delta paths (after WS, after notifications); they guarantee
    parity when races occur.
  - Reintroduce `ws.onerror` → `ws.close()`; it causes thrash.

Troubleshooting Checklist
-------------------------

1) Enable debug: `localStorage.setItem('CHAT_DEBUG','1')`
   - Expect: one WS, topics include `notifications` and `booking-requests:<id>`.
   - Expect: `[rt] ws recv { topic:'booking-requests:<id>', type:'message' }` on new messages.

2) If tail still lags on client:
   - Check for `thread:pokedelta` events (notification path) — they should fire
     when the active thread receives a NEW_MESSAGE.
   - Confirm `fetchDelta` calls (look for the GET /messages?mode=delta&after_id).

3) If subscription thrash reappears:
   - Ensure `ws.onerror` does not close the socket. `onclose` owns scheduling.

Appendix: Relevant Paths
------------------------

- useThreadData — frontend/src/components/chat/MessageThread/hooks/useThreadData.ts
- useThreadRealtime — frontend/src/components/chat/MessageThread/hooks/useThreadRealtime.ts
- Thread orchestrator — frontend/src/components/chat/MessageThread/index.web.tsx
- SystemMessage — frontend/src/components/chat/MessageThread/message/SystemMessage.tsx
- Notifications — frontend/src/hooks/useNotifications.tsx
- Realtime transport — frontend/src/hooks/useRealtime.ts

If you need to evolve this code, please update this runbook and keep the listed
invariants intact. These are the guardrails that make the tail render instantly
and reliably for both sides.

