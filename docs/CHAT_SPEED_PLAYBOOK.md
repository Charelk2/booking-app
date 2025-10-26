# Chat, Payments, and Realtime Speed Playbook

This playbook captures what made the UI feel “payment‑fast” across chat, attachments, and payments; how we made it resilient; and exactly how to apply the pattern to new wizards/flows.

## Outcomes (What “fast” means here)

- Send (text): click → “sent” in ~150–200 ms (WS echo ACK).
- Delivered: sender flips to “delivered” within a few hundred ms when the recipient is active.
- Attachments: placeholder appears for peers in ~≤400 ms; finalize swaps thumbnail without flicker.
- Unread navigation: messages render fast via small initial/delta loads; no stale “sending” clocks.
- Degraded realtime (SSE): converges within ~1–2 s (one small delta fetch), no storms.

## Fast Path Principles

1) Commit → broadcast immediately (in‑band), outbox for reliability
   - Backend: `backend/app/api/api_message.py` — broadcast the message envelope right after DB commit (event loop task). Fall back to `BackgroundTasks` only if needed. Outbox is used for system/attachments (and payments/quotes) so fanout is reliable across restarts.

2) Correlation ACK for text (client_request_id)
   - Frontend sets `X-Client-Request-Id` per send; the server echoes it in the WS envelope so the sender can flip “sending” → “sent” on the echo (no need to wait for POST).
   - Files: `frontend/src/components/chat/MessageThread/index.web.tsx`, `frontend/src/components/chat/ChatComposer.tsx`.
   - API helper: `frontend/src/lib/api.ts::postMessageToBookingRequest` supports `{ clientRequestId }`.

3) Attachments: init → upload → finalize (fast placeholder)
   - Backend:
     - `POST /messages/attachments/init` creates a placeholder message + presigns upload, broadcasts placeholder, enqueues outbox.
     - `POST /messages/{message_id}/attachments/finalize` persists URL/meta, broadcasts update, enqueues outbox.
     - File: `backend/app/api/api_message.py`.
   - Frontend:
     - `initAttachmentMessage()` → presigned PUT (progress) → `finalizeAttachmentMessage()`.
     - Placeholder ID is the server id (swap temp → server id immediately), so echo never duplicates.

4) Delivered semantics (accurate + cheap)
   - Recipient: when active/visible in the thread and a counterparty message arrives, PUT `/messages/delivered` with `up_to_id` (debounced/coalesced). No DB writes.
   - Server: broadcasts `{ v:1, type:'delivered', up_to_id, user_id }`.
   - Sender: marks own messages `<= up_to_id` as delivered (read still wins).
   - Files: `backend/app/api/api_message.py` (delivered PUT), `frontend/src/components/chat/MessageThread/hooks/useThreadRealtime.ts`.

5) Subscribe before fetch + small deltas
   - Make sure WS subscribe happens before the first fetch on thread open so new echoes land immediately.
   - First load: small initial (e.g., 50) or small delta (e.g., 250) to paint fast; backfill older messages on demand.

6) Cache hygiene (no stale clocks)
   - Don’t persist temp/sending/queued bubbles to sessionStorage/IDB.
   - Files: `frontend/src/lib/chat/threadCache.ts` filters before writes.

7) One source of truth for list/nav/panels
   - Use `threadStore` for last_message_* and unread; emit `threads:updated { immediate:true }` on sender echo, finalize, delivered/read to keep inbox/nav/panels in sync.

## Files (Key Touchpoints)

- Backend
  - `backend/app/api/api_message.py`: create + immediate broadcast; attachments init/finalize; delivered PUT; read receipts.
  - `backend/app/api/api_payment.py`: payment success → broadcast system message (mirrors chat path); metrics.
  - `backend/app/api/api_ws.py`: broadcast timings; error counters.
- Frontend (chat)
  - `frontend/src/components/chat/MessageThread/index.web.tsx`: send pipeline, echo‑backup flip (tiny 180 ms), attachments flow.
  - `frontend/src/components/chat/MessageThread/hooks/useThreadData.ts`: message state, small initial/delta loads, cache writes.
  - `frontend/src/components/chat/MessageThread/hooks/useThreadRealtime.ts`: subscribe, ingest, delivered ack, read receipts.
  - `frontend/src/lib/api.ts`: message APIs, attachments init/finalize, delivered PUT.
  - `frontend/src/lib/chat/threadCache.ts`: filter out temp/sending/queued writes.
- Other senders wired to the same fast path
  - `frontend/src/components/chat/ChatComposer.tsx`
  - `frontend/src/app/service-providers/[id]/ProfileClient.tsx`
  - `frontend/src/components/booking/PersonalizedVideoFlow.tsx`
  - `frontend/src/components/booking/BookingWizard.tsx`
  - `frontend/src/components/dashboard/index.tsx`

## Applying This to New Flows (Checklist)

Backend (if the flow creates messages)
- After DB commit, schedule WS broadcast immediately (event loop `create_task`), enqueue outbox for reliability.
- If sending attachments, expose `attachments/init` + `finalize` endpoints.
- If you need a “delivered” feel, use the existing delivered PUT (no DB writes).

Frontend
- Always set `X-Client-Request-Id` and use the shared sendWithQueue pipeline so “sending” flips to “sent” on the echo.
- For attachments, init → presigned PUT (progress) → finalize; use server id as placeholder id.
- On sender echo/finalize, emit `threads:updated { immediate:true }` to refresh inbox ordering/preview instantly.
- On recipient ingest (active/visible), send one debounced delivered PUT (coalesced to highest id).
- Never persist temp/sending/queued to caches; rely on small initial/delta fetch on open.

## Observability

- Set `METRICS_STATSD_ADDR=127.0.0.1:8125` to enable StatsD counters/timers.
- Server metrics (non‑blocking): `broadcast.ms/error_total`, `message.create_success_total`, `message.attachment_init/finalize_total`, `message.delivered_signal_total`, `outbox.delivered_total/attempt_failed_total`, `payment.*`.
- Optional client metrics: message_send_latency_ms (click→sent), message_delivered_latency_ms (sent→delivered), ws_mode_switches, thread_delta_fetch_ms.

## Quick QA Script (high confidence)

1) Same‑thread send: click → sent in ~≤200 ms; delivered flips quickly when recipient is active; peer sees live bubble.
2) Recipient off‑thread: sender stays sent; flips delivered when recipient opens the thread; no duplicate events.
3) Unread navigation: no cached clocks; initial/delta paints fast; live events during entry render immediately.
4) Attachments: placeholder fast; finalize swaps to thumbnail; Retry finalize works (no re‑create).
5) SSE degrade: single small delta after events; converges ≤2 s; no fetch storm.

## Notes for Payments / Paystack

- Payments follow the same pattern: commit → broadcast “Payment received” system message; outbox for reliability. Keep verify/webhook idempotent.
- Local testing: if Paystack’s iframe won’t close without webhook, a verify poller inside the modal in iframe‑fallback mode can close on `/payments/verify`=OK.

---

This playbook is modular by design. Copy the checklist for any new wizard/flow that needs “unbreakable speed + resilience,” and point new contributors to the files above for examples.

