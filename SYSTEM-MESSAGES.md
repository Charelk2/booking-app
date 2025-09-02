# System Messages & Rendering Guide

This document is a developer‑focused, end‑to‑end reference for every system message that is created, where and when it is created, the exact message text (as implemented), and how the frontend renders or transforms it. It also clarifies which events generate notifications vs. inline system messages, and how thread previews are labeled.

Contents
- Glossary and schema
- Backend sources of truth (where messages are created)
- Thread preview labels (backend helper)
- Frontend rendering rules (labeling, CTAs, suppression)
- Event timeline and exact system messages
- Notifications vs. system messages
- Idempotency and deduping


## Glossary & Schema

- `message_type`: `USER | QUOTE | SYSTEM` (legacy `TEXT` normalized to `USER`).
- `visible_to`: `artist | client | both` – limits who sees a message in a thread.
- `action`: optional action token for SYSTEM CTA lines. Known values:
  - `review_quote`
  - `view_booking_details`
- `system_key`: optional stable key used to dedupe identical automations per thread (UPSERT via `(booking_request_id, system_key)`).
- Booking details prefix: `"Booking details:"` – used to identify details summary lines.

Data model references:
- Backend: `backend/app/models/message.py`
- CRUD: `backend/app/crud/crud_message.py`
- Parser/labels: `backend/app/utils/messages.py`


## Backend Sources (where messages are created)

- Booking request creation and details summaries: `backend/app/api/api_booking_request.py` (+ helpers in `backend/app/utils/messages.py`).
- Quotes: `backend/app/api/api_quote_v2.py` (quote bubbles), tests at `backend/tests/test_quote_*` show SYSTEM companion lines in some cases.
- Payments: `backend/app/api/api_payment.py`.
- Pre‑event reminders and ops nudges: `backend/app/services/ops_scheduler.py` (invoked by periodic tasks in `backend/app/main.py`).


## Thread Preview Labels (server)

Helper: `backend/app/utils/messages.py::preview_label_for_message`
- QUOTE → `"Quote from {sender}"`.
- Booking details summary (`content` starts with `Booking details:`) → `"New Booking Request"`.
- System content starting with `"Payment received"` → `"Payment received"`.
- Content containing `"booking is confirmed"` or starting with `"Booking confirmed"` → `"Booking confirmed"`.
- Fallback → first 80 chars of last message, with newlines collapsed.


## Frontend Rendering Rules

Labeling helper: `frontend/src/lib/systemMessages.ts`
- `isSystemMessage(m)`: true if `message_type==='SYSTEM'` or has `system_key`.
- `systemLabel(m)`: maps known keys to short labels; fallback = `content` or `"Update"`.
  - Known keys: `booking_details_v1`, `event_prep_*`, `quote_accepted`, `quote_declined`, `quote_expiring`, `quote_expired`, `deposit_due`, `booking_confirmed`.

Central renderer: `frontend/src/components/booking/MessageThread.tsx` (function `renderSystemLine`) governs:
- Centered gray separators for generic `SYSTEM` lines.
- CTA extraction:
  - Receipt download: detects `system_key==='payment_received'` or any label containing “receipt”; adds a `Download receipt` link resolved from `bookingDetails.payment_id` or a URL parsed from the message content.
  - Deposit due: shows a `Pay now` button if a payable quote exists and payment isn’t complete.
- Event reminders:
  - Normalizes copy to `Event in {n} days: {date}. Add to calendar: {url}. If not done yet, please finalise event prep.` (if a calendar link can be built) or a no‑link variant.
- Suppression:
  - System lines with `action==='review_quote'` or `action==='view_booking_details'` are not rendered as plain bubbles. They are consumed by the thread UI to render dedicated CTAs (e.g., a quote bubble or a header/inline “View Booking Details” button).


## Event Timeline & Exact System Messages

The following lists each lifecycle event, triggers, exact message content, visibility, dedupe keys, and rendering behavior.

### A) Booking Request Created

1) Details summary (SYSTEM_INFO)
- Created by: `api_booking_request.create_booking_request()` (and on later edits) as a SYSTEM line that begins with:
  - Content prefix: `Booking details:`
  - Body: Key/value lines such as `Location: ...`, `Guests: ...`, etc.
- `visible_to`: `both` (unless otherwise constrained by endpoint logic).
- `system_key`: `booking_details_v1` (deduped; multiple updates keep the earliest line stable).
- Notifications: suppressed for this automated summary (see `notify_user_new_message` skip list).
- Rendering:
  - MessageThread hides verbose “booking details” summaries from the visible stream but parses them for the right/side details panel.
  - Thread preview label is rewritten to `"New Booking Request"` by the backend helper.

2) Artist CTA to draft a quote
- Created by: `api_booking_request.create_booking_request()`
- `message_type`: `SYSTEM`
- `visible_to`: `artist`
- `action`: `review_quote`
- Content: CTA only (button rendered by the frontend; the raw line is not displayed as a bubble).
- Notifications: may be emitted when `EMIT_NEW_MESSAGE_FOR_NEW_REQUEST=1` is set (feature‑flagged).
- Rendering: Frontend detects `action==='review_quote'` and renders a quote CTA; the raw system bubble is suppressed.

### B) Quote Sent / Accepted / Declined

1) Quote sent to client
- QUOTE bubble message (structured), created by quote API.
- Optional SYSTEM CTA with `action='review_quote'` to nudge review.
- Rendering: Renders as a quote bubble with Accept/Decline; the CTA system bubble is suppressed (consumed for UI state).

2) Quote accepted/declined (SYSTEM_INFO)
- Keys (where present): `quote_accepted`, `quote_declined`.
- Preview label: `"Quote accepted"` or `"Quote declined"` (via frontend’s `systemLabel`) and backend preview helper.
- Rendering: Centered gray system line; content is already concise. Notification to artist is expected from quote handlers (see tests).

### C) Payment (Deposit or Full)

Trigger paths: `POST /api/v1/payments` success, `GET /api/v1/payments/paystack/verify`, or `POST /api/v1/payments/paystack/webhook` on `charge.success`.

1) Payment receipt line (SYSTEM_INFO; deduped)
- Created by: `backend/app/api/api_payment.py`.
- `message_type`: `SYSTEM`
- `visible_to`: `both`
- `system_key`: `payment_received` (dedupe; idempotent on retries)
- Sender: artist (server uses `artist_id` as sender)
- Content (direct/mock gateway path):
  - `Payment received. Your booking is confirmed and the date is secured. Receipt: /api/v1/payments/{payment_id}/receipt`
- Content (Paystack verify/webhook variant):
  - `Payment received — order #{payment_id}. Receipt: /api/v1/payments/{payment_id}/receipt`
- Notifications: no explicit `NEW_MESSAGE` notification call in payment handlers. Threads still update via WebSocket/REST and preview label becomes `"Payment received"`.
- Rendering:
  - Centered gray system line with the exact text above.
  - A `Download receipt` link is appended by the frontend if a receipt URL can be resolved.
  - Thread preview: `"Payment received"`.

2) View booking details CTA (two mirrored SYSTEM_CTA lines)
- Created by: `backend/app/api/api_payment.py` immediately after (1).
- Line A:
  - `visible_to`: `client`
  - Sender: artist
  - `content`: `View Booking Details`
  - `action`: `view_booking_details`
- Line B:
  - `visible_to`: `artist`
  - Sender: client
  - `content`: `View Booking Details`
  - `action`: `view_booking_details`
 - Notifications: a payment receipt also emits NEW_MESSAGE notifications for both parties.
- Rendering: the raw bubble is suppressed; the action is consumed to render a CTA button (deep‑links to booking view / details panel).

Payment‑side state changes performed alongside messaging:
- `payment_status='paid'` and `charged_total_amount` set to the full quote total.
- `confirmed=true` on `BookingSimple`; associated `BookingRequest` → `REQUEST_CONFIRMED`; `Booking` → `CONFIRMED`.

### D) Deposit Due (removed)

Deposit flow was removed. Clients pay the full amount upfront; no deposit reminders or CTAs are emitted.

### E) Pre‑Event Reminders (T‑3d / T‑24h)

Source: `backend/app/services/ops_scheduler.py::handle_pre_event_reminders` (runs every ~30 min via `ops_maintenance_loop` in `backend/app/main.py`). Only for `Booking.status==CONFIRMED`.

1) Client‑facing reminder (SYSTEM_INFO)
- Exact content:
  - `Event in 3 days: {YYYY-MM-DD HH:MM}. Add to calendar: /api/v1/bookings/{booking_id}/calendar.ics. Please share any access/parking details and confirm guest count.`
  - For T‑24h, label changes to `Event is tomorrow` (same format otherwise).
- `visible_to`: `client`
- Sender: artist
- Notifications: Yes – created via `_post_system`, which invokes `notify_user_new_message` for both sides (unless filtered by its skip rules, which do not include these reminders).
- Rendering (frontend normalization):
  - Rewrites to short label: `Event in {n} days: {yyyy-mm-dd}. Add to calendar: {url}. If not done yet, please finalise event prep.`
  - If a `.ics` URL can’t be resolved, renders the no‑link variant.

2) Artist‑facing reminder (SYSTEM_INFO)
- Exact content:
  - `Event in 3 days: {YYYY-MM-DD HH:MM}. Tech check and arrival time confirmed? If sound is required, ensure supplier status is up to date in this thread.`
  - For T‑24h: `Event is tomorrow: {YYYY-MM-DD HH:MM}. ...` (same follow‑up text).
- `visible_to`: `artist`
- Sender: artist
- Notifications: same as above.
- Rendering: same centered system style; shorter normalized copy used when possible.


## Notifications vs. System Messages

- System messages appear inline in the chat thread and may also trigger a `NEW_MESSAGE` notification. Skipped cases:
  - Booking details summaries (`"Booking details:"`), video‑flow prompts, and similar “automation only” lines are intentionally NOT notified (`notify_user_new_message` skip list).
- Payment messages (receipt + view_booking_details CTAs) emit `NEW_MESSAGE` notifications for both parties.
—
Deposit‑due notifications are not used.
- Pre‑event reminders do post SYSTEM chat lines and also notify both parties.


## Idempotency & Deduping

- `system_key` enforces one copy per thread per automation:
  - `booking_details_v1`: details summary.
  - `payment_received`: payment receipt line; reused by all payment paths (direct, verify, webhook). Repeated webhook/verify calls are no‑ops for the message.
- Frontend also performs display‑level dedupe of system lines by `(system_key + content)` to avoid repetition after refresh.


## Quick Reference (copy & where it comes from)

- Payment received (SYSTEM, both)
  - `Payment received. Your booking is confirmed and the date is secured. Receipt: /api/v1/payments/{id}/receipt`
  - or `Payment received — order #{id}. Receipt: /api/v1/payments/{id}/receipt`
  - Backend: `api_payment.py` (post‑payment, verify, webhook). Adds `Download receipt` link on the frontend.

- View Booking Details (SYSTEM CTA)
  - Content: `View Booking Details` (one to client, one to artist)
  - `action='view_booking_details'`
  - Backend: `api_payment.py` right after confirming payment.
  - Frontend: raw bubble suppressed; renders a CTA.

- Event reminder (SYSTEM, T‑3d / T‑24h)
  - Client: `Event in 3 days: {YYYY-MM-DD HH:MM}. Add to calendar: /api/v1/bookings/{id}/calendar.ics. Please share any access/parking details and confirm guest count.`
  - Artist: `Event in 3 days: {YYYY-MM-DD HH:MM}. Tech check and arrival time confirmed? If sound is required, ensure supplier status is up to date in this thread.`
  - Backend: `ops_scheduler.py::handle_pre_event_reminders`.
  - Frontend: normalized short label; may append calendar link; not suppressed.

- Booking details summary (SYSTEM, both)
  - Prefix: `Booking details:` followed by summary lines
  - Backend: booking request endpoints; `system_key='booking_details_v1'`
  - Frontend: hidden from visible stream; parsed into the details panel. Preview label becomes `"New Booking Request"`.

- Quote accepted/declined (SYSTEM)
  - Labels: `Quote accepted` / `Quote declined` (keyed; concise content)
  - Backend: quote endpoints/events
  - Frontend: centered system line; preview label reflects acceptance/decline.

- Deposit due (Notification only)
  - `Deposit R{amount} due by {YYYY-MM-DD}`
  - Backend: `ops_scheduler.py::handle_deposit_due_reminders` → `notify_deposit_due`
  - Frontend: notifications drawer/toasts; not posted as chat lines.


## Files & Pointers

- Backend
  - Payments: `backend/app/api/api_payment.py`
  - Ops scheduler: `backend/app/services/ops_scheduler.py`
  - Notifications: `backend/app/utils/notifications.py`
  - Message helpers: `backend/app/utils/messages.py`
  - Message model: `backend/app/models/message.py`
  - Message CRUD: `backend/app/crud/crud_message.py`
  - Background loops: `backend/app/main.py` (`ops_maintenance_loop`, `expire_quotes_loop`)

- Frontend
  - System labeling: `frontend/src/lib/systemMessages.ts`
  - Thread UI and renderer: `frontend/src/components/booking/MessageThread.tsx`
  - Client bookings pages (receipt links):
    - `frontend/src/app/dashboard/client/bookings/page.tsx`
    - `frontend/src/app/dashboard/client/bookings/[id]/page.tsx`


## Notes & Extensions

- To emit explicit in‑app notifications for payment receipt or the post‑payment `view_booking_details` CTA, call `notify_user_new_message(...)` in `api_payment.py` where the messages are created. Current implementation relies on real‑time updates and preview labels without emitting extra toasts.
- When adding new automations, provide a `system_key` and extend `systemMessages.ts` mapping for consistent labels.
