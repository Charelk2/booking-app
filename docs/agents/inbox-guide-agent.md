## Inbox Guide Agent

Make the Inbox the source of truth by normalizing system messages, providing atomic previews + unread counts, and guiding users with subtle CTAs inside the chat thread.

### Goals

- Clean previews: short, human labels (e.g., “New booking request”) instead of verbose summaries.
- Atomic state: one endpoint returns preview + unread count to avoid races.
- Low-noise UX: show helpful system lines inline; notify only on human-actionable events.
- Deterministic: identical automations are deduped via system_key.

### Principles

- Inbox-first: all important states are visible/derivable from the thread.
- One action per moment: each system line nudges exactly one next step.
- Consistency by default: one helper produces all preview labels.
- Feature-flag spikes: noisy behaviors (e.g., emit unread on creation) are gated.

### Message Taxonomy

- USER – regular chat.
- SYSTEM_INFO – inline info, no notification (e.g., “Booking details received”).
- SYSTEM_CTA – inline info with action button (e.g., “Review quote”).
- QUOTE – structured quote bubble with Accept/Decline.
- PAYMENT – payment intent/receipt lines (notify counterparty).

All automated lines include a stable system_key for dedupe (e.g., booking_details_v1, quote_sent_v2).

### Triggers → Actions

| Trigger | Who sees it | Message type | Preview label | Notify? |
|---|---|---|---|---|
| Booking created | Artist | SYSTEM_INFO (“You have a new booking request.”) | “New booking request” | Flagged via EMIT_NEW_MESSAGE_FOR_NEW_REQUEST |
| Details posted/edited | Both | SYSTEM_INFO (hidden in stream, parsed for card) | unchanged | No |
| Quote sent | Client | QUOTE + optional SYSTEM_CTA (“Review quote”) | “Quote from {Artist}” | Yes (client) |
| Quote accepted/declined | Artist | SYSTEM_INFO (“Quote accepted/declined”) | “Quote accepted/declined” | Yes (artist) |
| Payment received | Both | PAYMENT (“Payment received”) | “Payment received” | Yes (counterparty) |
| Booking confirmed | Both | SYSTEM_INFO | “Booking confirmed” | Yes (both) |
| Event reminders (T-3d, T-24h) | Both | SYSTEM_INFO | unchanged | Optional (soft badge only) |

### Backend Responsibilities

1) Unified Threads Preview Endpoint (atomic)

`GET /api/v1/message-threads/preview?role={artist|client}&limit=&cursor=`

→ 200 OK

```
{
  "items": [{
    "thread_id": "t_123",
    "counterparty": { "name": "Klient2", "avatar_url": "..."},
    "last_message_preview": "New booking request",
    "last_actor": "system|user|artist|client",
    "last_ts": "2025-08-19T12:34:56Z",
    "unread_count": 2,
    "state": "requested|quoted|confirmed|completed|cancelled",
    "meta": { "booking_id": "b_987", "event_date": "2026-04-30", "location": "Cape Town" },
    "pinned": false
  }],
  "next_cursor": null
}
```

- Server computes `last_message_preview` via the Preview-Label Helper.
- Unread aggregation groups `NEW_MESSAGE` notifications by thread.

2) Preview-Label Helper (single source of truth)

Pseudocode:

```
def preview_label(last_message, thread_state):
    if last_message.type == "QUOTE":
        return f"Quote from {last_message.sender_display}"
    if thread_state == "requested":
        return "New booking request"
    if last_message.system_key == "payment_received_v1":
        return "Payment received"
    if last_message.system_key == "booking_confirmed_v1":
        return "Booking confirmed"
    return sanitize_snippet(last_message.text, max_len=80)
```

Used by: threads preview endpoint, notifications feed, any “last message” computation.

3) Feature Flags

- `EMIT_NEW_MESSAGE_FOR_NEW_REQUEST` (bool, default false): when true, emit a NEW_MESSAGE notification at booking creation so unread badges tick immediately for artists.

4) Dedupe & Storage

- Every automated post includes `system_key`.
- The messages list API may filter or compact repeated `system_key` lines server-side.

### Frontend Behavior

- Thread list: render `last_message_preview`, mini meta (date, city), and unread badge from the unified endpoint. No extra fetches.
- Message stream: render SYSTEM_INFO as subtle centered separators; hide verbose “booking details” lines from visible stream but parse them for a right/side card.
- Header badge: subscribe to socket events and refresh via the unified endpoint to keep counts in sync.

### Notifications Policy (in-app)

- Notify when human action is expected by the other side (quote sent, quote decision, payment posted, status changed).
- Don’t notify for pure automation (details summaries, AI prompts).
- System messages may still render inline without notifications.

### Analytics

- Track funnel events: `request_viewed`, `quote_viewed`, `quote_accepted`, `payment_viewed`, with `thread_id` + `role`.
- Track dwell time between system CTA and user action.

### Test Matrix (essentials)

- Booking create → preview = “New booking request”; unread increments only when flag is true.
- Quote sent → client sees preview “Quote from {Artist}”; unread +1.
- Quote accepted/declined → artist sees correct preview + unread.
- Deduped `booking_details_v1` does not spam stream or previews.
- Socket events refresh header + list consistently.

### Rollout

- Ship Preview-Label Helper (no behavior change).
- Ship unified preview endpoint; switch UI to it.
- Enable feature flag in staging; validate badge/preview.
- Migrate old surfaces (emails/push later) to helper.

### Recommendation (TL;DR)

- Yes to the unified endpoint (atomic, faster, fewer bugs).
- Yes to the preview-label helper (one place to govern copy and states).
- Keep the “Inbox Guide Agent” concept and implement exactly as above; it will make the system feel coherent and calm while still driving action.
