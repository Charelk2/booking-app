# Threads Preview Performance Wins

This document records the focused changes that made the Inbox thread preview fast and predictable, while preserving the existing JSON contract and UX.

## What Changed (Surgical and Safe)

- Single‑query preview composition
  - Route: `backend/app/api/api_threads.py:get_threads_preview`
  - Finds the latest visible message per thread with a window function (`row_number() over (partition by booking_request_id order by timestamp desc)`) filtered by viewer visibility (`BOTH` + current viewer).
  - Joins that directly onto `booking_requests` filtered by the current user, orders by `last_ts` (message timestamp or `created_at`), and applies `limit` in the same query.
  - Loads only minimal counterparty info via `selectinload` (client/artist + `artist_profile` business name/avatars) and `service.service_type` (for PV behavior).
  - Eliminates the heavy follow‑up recent‑messages fetch and the accepted‑quote lookup entirely for preview.

- Preserved PV semantics (no surprises)
  - If `service_type` is Personalized Video, we only include PV threads that have a “Payment received” system line (same as before). This is done via a single `get_payment_received_booking_request_ids` lookup across the listed PV thread ids.

- Label fidelity and preview keys
  - Still uses `preview_label_for_message` to generate `last_message_preview` (coerces `message_type`/`sender_type` to enums as needed).
  - Restores `preview_key` and `preview_args` for:
    - Booking details → `new_booking_request`
    - Payment received → `payment_received`
    - Event reminder → `event_reminder` (with `daysBefore`/`date` parsed from content)

- Everything else unchanged
  - JSON shape is identical: `{ items: [ { thread_id, counterparty { name, avatar_url }, last_message_preview, last_actor, last_ts, unread_count, state, meta, pinned, preview_key, preview_args } ], next_cursor: null }`
  - ETag logic and Server‑Timing remain intact.
  - orjson serialization remains (serialization now measures in sub‑millisecond with `ser;dur≈0.1ms`).

## Results (Server‑Timing)

Before: `brs≈4355ms`, `ser≈0.1ms` → route time dominated by preview composition across 100 threads.

After: `brs≈435ms` (≈10× faster), `unread≈60ms`, `build≈27ms`, `ser≈0.2ms`.

End‑to‑end TTFB improves drastically; residual time largely reflects TLS and network hop (which is outside the route).

## Why It’s Safe

- The query shape is a strict narrowing of what we already needed and avoids extra ORM round‑trips. The response schema and keys did not change.
- PV inclusion rules, preview labels/keys, unread counts, and ETag behavior are preserved.
- The route has a feature‑complete fallback path if any future optimization needs to be disabled.

## Next Steps (Optional)

- Client: persist last preview ETag per user and send `If‑None‑Match` on first load → first open becomes an instant 304 when nothing changed.
- Client: render from cache immediately (use cached summaries for the left pane) while preview fetch runs in the background.
- Server: add a Redis‑backed ephemeral preview cache (per `user+role+limit`) updated on chat/payment/status events. Serve cached bytes with stored ETag and 304 when unchanged for “always fast” previews across instances.

