# AGENTS.md
Documentation for the automation modules ("agents") that power the booking application.
For setup instructions see [README.md](README.md).

For scaling, performance, and production runbooks, see [SCALE.md](SCALE.md).

For a step‑by‑step “payment‑fast” chat and realtime guide (how to wire
client_request_id, delivered acks, attachment init/finalize, fast broadcast,
and cache hygiene), see [docs/CHAT_SPEED_PLAYBOOK.md](docs/CHAT_SPEED_PLAYBOOK.md).

---

## Agents Overview

| Agent | Purpose | Key files | Trigger |
|-------|---------|-----------|---------|
| **Booking Request** | Orchestrates the booking wizard and business rules; queues form steps offline and retries when back online | `backend/app/api/api_booking_request.py`<br>`frontend/src/components/booking/BookingWizard.tsx` | When a client submits or updates a booking |

| **NLP Booking** | Extracts event details and event type from natural language descriptions | `backend/app/services/nlp_booking.py`<br>`backend/app/api/api_booking_request.py`<br>`frontend/src/components/booking/BookingWizard.tsx` | When a client provides a free-form event description |

| **Provider Matching** | Selects sound and accommodation providers | `backend/app/crud/crud_service.py`<br>`backend/app/api/api_service.py` | During booking and quote steps |
| **Travel & Accommodation** | Calculates travel distance, lodging costs, and now weather forecasts | `backend/app/services/booking_quote.py`<br>`backend/app/api/api_weather.py` | When estimating travel or lodging expenses |
| **Quote Generator** | Gathers performance, provider, travel, and accommodation costs | `backend/app/api/api_quote.py`<br>`frontend/src/components/chat/MessageThread.tsx` | After all booking info is entered |
| **Quote Preview** | Shows an estimated total during the review step | `frontend/src/components/booking/wizard/Steps.tsx` | Right before submitting a booking request |
| **Review** | Manages star ratings and comments for completed bookings | `backend/app/api/api_review.py`<br>`frontend/src/app/service-providers/[id]/page.tsx` | After a booking is marked completed |
| **Payment** | Handles full upfront payments via `/api/v1/payments` | `backend/app/api/api_payment.py` | After quote acceptance |
| **Notification** | Sends emails, chat alerts, and booking status updates | `backend/app/api/api_notification.py`<br>`backend/app/utils/notifications.py`<br>`frontend/hooks/useNotifications.ts` | On status changes, messages, actions |
| **Chat** | Manages client–artist chat and WebSocket updates; queues offline messages and retries with exponential backoff, batches typing indicators, lengthens heartbeats on mobile or hidden tabs, coalesces presence updates, and defers image previews until opened | `backend/app/api/api_message.py`<br>`backend/app/api/api_ws.py`<br>`frontend/src/components/chat/MessageThread.tsx` | Always on for active bookings |
| **Caching** | Caches artist lists using Redis | `backend/app/utils/redis_cache.py`<br>`backend/app/api/v1/api_service_provider.py` | On artist list requests |
| **Personalized Video** | Automates Q&A for custom video requests | `frontend/src/components/booking/PersonalizedVideoFlow.tsx`<br>`frontend/src/lib/videoFlow.ts` | When `service_type` is Personalized Video |
| **Availability** | Checks artist/service availability in real time | `backend/app/api/v1/api_service_provider.py`<br>`frontend/src/components/booking/BookingWizard.tsx` | On date selection and booking start |
| **Form State** | Maintains booking progress across steps | `frontend/src/components/booking/BookingWizard.tsx`<br>`frontend/src/components/booking/wizard/Steps.tsx`<br>`frontend/src/contexts/BookingContext.tsx` | Throughout the user session |
| **Validation** | Validates user input and business logic | `frontend/src/components/booking/BookingWizard.tsx`<br>`backend/app/schemas/` | At every form step and backend endpoint |
| **Calendar Sync** | Imports Google Calendar events and merges them into `read_artist_availability` | `backend/app/api/api_calendar.py`<br>`backend/app/services/calendar_service.py`<br>`frontend/src/app/dashboard/profile/edit/page.tsx` | When artists connect or disconnect Google Calendar |
| **Inbox Guide** | Normalizes system messages for thread previews, emits thread notifications on new requests (flagged), and guides users via lightweight CTAs in the chat | `backend/app/crud/crud_booking_request.py`<br>`backend/app/api/api_booking_request.py`<br>`backend/app/utils/messages.py`<br>`backend/app/utils/notifications.py`<br>`frontend/src/components/chat/MessageThread.tsx` | On booking creation and key booking/chat events |

---

## Details

### 1. Booking Request Agent

* **Purpose:** Orchestrates multi-step booking—receives event details, stores booking-in-progress, validates required info.
* **Frontend:** `BookingWizard.tsx` manages state, collects data, sends to backend.
* **Backend:** `api_booking_request.py` parses, validates, persists booking requests, and triggers downstream agents.
* Queues form submissions when offline and retries with exponential backoff once connectivity is restored.

### 2. Provider Matching Agent

* **Purpose:** Matches client’s needs to artist’s preferred (and fallback) providers for sound and accommodation.
* **Frontend:** After event/artist selection, prompts with available/recommended providers.
* **Backend:** `crud_service.py` and `api_service.py` fetch, filter, and prioritize provider options.

### 3. Travel & Accommodation Agent

* **Purpose:** Calculates travel distance and optional lodging costs so quotes stay accurate. The agent also retrieves 3-day weather forecasts for trip planning. `calculateTravelMode()` geocodes any South African town to find the closest airport and compares flight costs with driving.
* **Frontend:** Travel and accommodation fees are estimated within booking flows like `frontend/src/components/booking/BookingWizard.tsx` and `frontend/src/components/chat/MessageThread.tsx`; the standalone quote calculator page has been removed.
* **Backend:** `booking_quote.py` exposes helpers used by the quote API. `/api/v1/travel-forecast` lives in `api_weather.py` and fetches forecast data from `wttr.in`.

### 4. Quote Generator

* **Purpose:** Calculates and presents full, itemized quote: performance fee, provider, travel, accommodation, service fees.
* **Frontend:** Quote forms in `components/chat/MessageThread.tsx` show running totals.
* **Backend:** Calculator now lives in `api_quote.py` at `/quotes/estimate` (stateless). Persisted quotes remain in `api_quote.py`.

### 5. Quote Preview Agent

* **Purpose:** Shows an estimated total on the review step so the client knows what to expect.
* **Frontend:** `ReviewStep.tsx` calls the quote API and displays the total before submission.
* **Backend:** Reuses `api_quote.py` endpoints to provide quick totals.

### 6. Review Agent

* **Purpose:** Stores 1–5 star ratings and comments for completed bookings.
* **Frontend:** Artist profile pages show reviews and clients can submit them once a booking is done.
* **Backend:** `api_review.py` enforces who can review and fetches lists per artist or service.

### 7. Payment Agent

* **Purpose:** Collects full upfront payment when a quote is accepted.
* **Frontend:** Payment form appears after quote approval.
* **Backend:** `api_payment.py` creates and confirms payments (supports Paystack init/verify or mock gateway for local testing).

### 8. Notification Agent

* **Purpose:** Sends transactional emails, booking updates, reminders, and chat alerts.
* **Frontend:** `useNotifications.ts` for popups/toasts, badge updates.
* **Backend:** `api_notification.py` exposes CRUD endpoints while `utils/notifications.py` persists alerts in the `notifications` table and can send SMS via Twilio if credentials are configured. A new `/notifications/read-all` endpoint marks every notification read in one request.
* **Notification types:**
  - `new_message` — someone sent a chat message.
  - `new_booking_request` — a client created a booking request.
  - `booking_status_updated` — the request status changed.
  - `review_request` — triggered after an event is completed to solicit feedback.
* **UI:** Booking confirmed alerts show the artist's avatar so recipients can instantly recognize who the notification is from.
* **Email templating (Mailjet):**
  - Outbound emails are delivered via SMTP using `backend/app/utils/email.py` and the `SMTP_*` settings (Mailjet SMTP host, API key/secret, and from address).
  - For richer layouts, the agent can send Mailjet transactional templates via SMTP headers using `send_template_email(recipient, template_id, variables, subject)`.
  - The “new booking request to provider” flow now uses `MAILJET_TEMPLATE_NEW_BOOKING_PROVIDER` (default: `7527677`) when `notify_user_new_booking_request()` fires, passing variables like `provider_name`, `client_name`, `event_date`, `event_time`, `event_location`, `service_name`, `budget`, `special_requests`, and `booking_url`.
  - The “client received quote” flow will use `MAILJET_TEMPLATE_NEW_QUOTE_CLIENT` (default: `7527935`) when a provider sends a quote, passing variables like `client_name`, `provider_name`, `event_date`, `event_time`, `event_location`, `service_name`, `quote_total`, `quote_expires_at`, and `booking_url`.
  - The “booking confirmed / payment received” flows use:
    - `MAILJET_TEMPLATE_BOOKING_CONFIRMED_PROVIDER` (default: `7527989`) for provider emails, with variables like `provider_name`, `client_name`, `event_date`, `event_time`, `event_location`, `service_name`, `total_paid`, `booking_reference`, and `booking_url`.
    - `MAILJET_TEMPLATE_BOOKING_CONFIRMED_CLIENT` (default: `7528057`) for client emails, with variables like `client_name`, `provider_name`, `event_date`, `event_time`, `event_location`, `service_name`, `total_paid`, `booking_reference`, and `booking_url`.
  - Future plan: move all system emails (booking confirmed, quote created/accepted, reminders, etc.) onto dedicated Mailjet templates by introducing `MAILJET_TEMPLATE_*` config keys and reusing the same helper.
  - Longer term we’ll route the same notification intents to WhatsApp/SMS by plugging Twilio (or another provider) into the existing Notification agent so each event can fan out to app, email, SMS, and WhatsApp in a template-driven way.

### 9. Chat Agent

* **Purpose:** Delivers real-time or async chat, manages unread notifications, logs chat history.
* **Frontend:** `components/chat/MessageThread.tsx` and related components handle sending and displaying messages.
* **Backend:** `api_message.py` stores messages and `api_ws.py` pushes updates via WebSocket.
* **Features:** Auto-scroll, mobile-friendly input with an emoji picker, avatars, batched typing indicator, adaptive heartbeats for mobile or background tabs, coalesced presence updates, offline send queue with exponential backoff, and image previews that load only when tapped. Media uploads now stream through the attachment endpoint so images, voice notes, and files post immediately with server-hosted URLs and rich metadata (name, type, size). Optimistic bubbles keep conversations snappy while uploads finish, and failed sends surface clear errors without leaving phantom placeholders.
* **Realtime stability:** A single global `RealtimeProvider` manages one WS/SSE connection app‑wide with keepalive pings; it falls back to SSE after repeated failures. Client‑side per‑instance pinning (Fly-Prefer-Instance) is disabled and transient 5xxs trigger a one‑shot unpinned retry. Infra guidance: run ≥2 instances, rolling deploys, and correct health checks for zero‑downtime.
* **Implementation notes:** Chat is fully hook‑driven (no imperative `MessageThread` ref/handle). Virtualized list adapters share a minimal, typed contract and derive `computeItemKey` from the item index (internally mapping to stable message group keys) to avoid signature drift between adapters.
* **WS auth:** Backend prefers `Sec-WebSocket-Protocol: bearer,<access_token>` and falls back to `Authorization: Bearer`, `?token=`, or `access_token` cookie. Auth failures now log source + exp/iat, cap oversized headers, and return `4401` with `Refresh required` when an expired token arrives alongside a refresh cookie. The frontend WS client always sends the bearer subprotocol when a token is present and will attempt one silent refresh/reconnect on early 4401/403/1006 handshakes before normal backoff.
### 10. Caching Agent

* **Purpose:** Cache heavy artist list responses using Redis.
* **Backend:** `redis_cache.py` stores serialized profiles; used in `api_service_provider.py`.
### 11. Personalized Video Agent

* **Purpose:** Automates question prompts for personalized video requests.
* **Frontend:** `PersonalizedVideoFlow.tsx` orchestrates Q&A using `videoFlow.ts`.


### 12. Availability Agent
* **Purpose:** Checks/updates in real time which artists and providers are available for a user’s event date and needs.
* **Frontend:** When client picks date/artist, disables blocked dates, shows live availability.
* **Backend:** `api_service_provider.py` logic for checking calendars, marking bookings.

### 13. Form State Agent

* **Purpose:** Manages progress through multi-step booking, “save for later,” restores session on reload or login.
* **Frontend:** Uses React context/state in `booking/BookingWizard.tsx` and `contexts/BookingContext.tsx`.
* **Details:** Booking progress is persisted in `localStorage` under `bookingState`. When the “Resume previous request?” modal is accepted, the agent now rehydrates both the context (`applySavedProgress`) and the React Hook Form instance via `reset(...)` so all steps (including earlier ones) reflect the saved draft fields. This behavior is covered by `frontend/src/components/booking/__tests__/BookingWizard.test.tsx`.

### 14. Validation Agent

* **Purpose:** Ensures all inputs are correct (dates, emails, phone, logic like “accommodation required if >X km”).
* **Frontend:** Inline validation on form steps, helpful error messages.
* **Backend:** Schema and Pydantic model validation for all POSTs/PATCHes.

### 15. NLP Booking Agent

* **Purpose:** Parses natural language descriptions to pre-fill booking details like event type, date, location, and guest count.
* **Frontend:** A text/voice input in `BookingWizard.tsx` sends the prompt and lets users apply or edit the AI-suggested values.
* **Backend:** `nlp_booking.py` performs lightweight extraction and `/api/v1/booking-requests/parse` exposes the service.

### 16. Inbox Guide Agent

* **Purpose:** Make the inbox the source of truth by harmonizing “system messages” with thread previews and nudging users with concise, contextual guidance.
* **Key behaviors:**
  - Replace verbose booking-detail summaries in conversation previews with the label “New Booking Request”.
  - Optionally emit a `new_message` notification whenever a booking is created so unread thread counts increment immediately (flag: `EMIT_NEW_MESSAGE_FOR_NEW_REQUEST=1`).
  - Keep system messages deduped with `system_key` (e.g., `booking_details_v1`).
  - Avoid noisy notifications for automated prompts (booking details, personalized video Q&A), while still rendering the messages inline.
* **Frontend:** `components/chat/MessageThread.tsx` renders system messages as centered gray lines; suppresses details summaries from the visible stream but parses them for the details card.
* **Backend:**
  - `crud_booking_request.get_booking_requests_with_last_message()` rewrites `last_message_content` to “New Booking Request” when the latest message is a details summary.
  - `api_booking_request.create_booking_request()` creates the initial system line to the artist and, when flagged, also emits a `new_message` notification so thread unread counts update.
  - `utils/messages.py` owns the `BOOKING_DETAILS_PREFIX` and parsing helpers.
* **Outcome:** Thread list stays clean and actionable, and users are guided inside the chat without over-notifying.




## How to Add or Modify an Agent

* Place new logic in an appropriate backend API/service or frontend component/hook/context.
* Update this file to keep documentation current for all automation and agent logic.
* Ensure each new agent is integrated with relevant booking, notification, or chat workflows as needed.
* Run `./scripts/test-all.sh` before committing changes to ensure backend and
  frontend tests pass. The script verifies that `node` and `npm` are installed
  and logs their versions. It calls Jest via Node so it works even when
  `node_modules/.bin` is missing. The path and version of the Jest binary are
  printed, and the script exits with a clear error if the binary cannot be
  found. Tests run for *all* commits by default. Set `SKIP_TESTS=1` to bypass
  them when absolutely necessary.
* If network access is limited, use the pre-built Docker image by running
  `./scripts/docker-test.sh`. Set `BOOKING_APP_IMAGE` to override the default
  registry path. The script runs the container with `--network none` by default;
  export `DOCKER_TEST_NETWORK=bridge` if tests require connectivity.
* `scripts/tests/test-test-all.sh` clones the repository into a temporary
  directory, runs `./scripts/test-all.sh`, and verifies that both
  backend and frontend test suites execute. Use this helper to confirm the test
  runner works on a clean checkout.
* SSR/frontend API origin: when the frontend and backend are on different hosts
  (e.g., Vercel frontend at `booka.co.za` and Fly backend at `api.booka.co.za`),
  set `SERVER_API_ORIGIN` (frontend env) to the backend origin (e.g.,
  `https://api.booka.co.za`) so server-side fetches hit the real API instead of
  the frontend host. Without this, SSR calls to `/api/v1/...` can 404 and
  trigger `notFound()`.

---

## Last Updated

2025-11-27

### Migration Note (Sessions + Runtime Bootstrap Hardening)

- Alembic head for `appdb` remains `ed57deb9c434` (`backend/alembic/versions/NEW_REV_add_sessions_table.py`); this revision is the canonical baseline for the current system.
- Runtime DB bootstrap was tightened so web workers no longer re-run schema DDL on startup:
  - `backend/app/main.py` now gates the heavy `ensure_*` helpers behind `SKIP_DB_BOOTSTRAP`. In production, web workers run with `SKIP_DB_BOOTSTRAP=1` so they **never** attempt schema changes; migrations are applied once via Alembic (or manual DDL recorded here and in `NEW_REV_add_sessions_table.py`).
- Identity/autoincrement helpers were made idempotent for Postgres:
  - `backend/app/db_utils.py:ensure_identity_pk` now inspects both `column_default` and `identity_generation` before attempting `ALTER COLUMN ... ADD GENERATED BY DEFAULT AS IDENTITY`. If a column is already identity or has a default/sequence, the helper is a no-op. This prevents repeated `column "id" ... is already an identity column` errors on tables like `email_events`, `sms_events`, `audit_events`, `service_moderation_logs`, `search_events`, `disputes`, `payouts`, `ledger_entries`, and `message_reactions`.
- Enum normalization for `messages.message_type` was aligned with the Postgres enum type:
  - `normalize_message_type_values` in `backend/app/db_utils.py` now casts `message_type::text` before applying `LOWER/UPPER` and then casts back to the enum, avoiding `function lower(messagetype) does not exist` errors.
- DB pooling and WS/preview concurrency were aligned with Cloud SQL/PgBouncer:
  - Default envs: `DB_POOL_SIZE=6`, `DB_MAX_OVERFLOW=6`, `DB_POOL_TIMEOUT=5` keep at most 12 app-side connections per machine and fail fast under pressure.
  - Pool wait sampling (`DB_POOL_METRICS=1`, `DB_POOL_METRICS_SAMPLE≈0.05`) logs `db_pool_wait_ms` percentiles and a throttled `db_pool_wait_high_ms` warning (with `pool_size`, `max_overflow`, `checked_out`) when checkout waits exceed `DB_POOL_WARN_MS` (default 400ms).
  - WS + inbox DB load is governed by `WS_DB_CONCURRENCY`, `INBOX_STREAM_CONCURRENCY`, `MESSAGE_LIST_CONCURRENCY`, and `THREADS_PREVIEW_CONCURRENCY`. For a single `performance-8x` machine with 4 Uvicorn workers, we target conservative values (e.g. `WS_DB_CONCURRENCY=2`, `INBOX_STREAM_CONCURRENCY=2`, `MESSAGE_LIST_CONCURRENCY=3`, `THREADS_PREVIEW_CONCURRENCY=2`) so total concurrent DB work stays under the pool cap even during heavy inbox refresh bursts.
- Preview/auth paths were validated against Postgres:
  - The inbox preview query (`/api/v1/message-threads/preview`) and auth refresh (`/api/v1/auth/refresh`) were profiled with `EXPLAIN (ANALYZE, BUFFERS)` on `appdb` and are fast (single-digit millisecond execution). Historical 30–40s latencies seen in HAR captures were traced to pool/concurrency and migration issues, not slow SQL.

### Migration Note (Booking Requests parent linkage)

- On the production `appdb` database, the Alembic logical head remains `ed57deb9c434` (file: `backend/alembic/versions/NEW_REV_add_sessions_table.py`). This revision is our **canonical baseline** for the current system; treat it as the main version going forward.
- To support linked artist/sound booking threads without introducing a new Alembic head, the `booking_requests` table was **manually** amended at this revision:
  - Column added:
    - `parent_booking_request_id integer NULL`
  - Index:
    - `CREATE INDEX ix_booking_requests_parent_booking_request_id ON booking_requests (parent_booking_request_id);`
  - Foreign key:
    - `ALTER TABLE booking_requests ADD CONSTRAINT fk_booking_requests_parent_booking_request_id FOREIGN KEY (parent_booking_request_id) REFERENCES booking_requests(id) ON DELETE SET NULL;`
- Code that reads/writes `BookingRequest.parent_booking_request_id` (used for linking artist bookings to sound‑supplier bookings) **assumes this column exists even though Alembic’s version marker is still `ed57deb9c434`**.
- When adding similar small, additive columns/tweaks in future, prefer this pattern:
  - Apply the DDL manually on `appdb` at revision `ed57deb9c434` (the `NEW_REV_add_sessions_table.py` baseline).
  - Append a dated comment to `backend/alembic/versions/NEW_REV_add_sessions_table.py` under the “Manual schema notes” section describing:
    - The table/column/index/constraint added, and
    - The date and reason.
  - Record the same SQL and rationale here in AGENTS.md.
  - Keep Alembic’s head pinned to `ed57deb9c434` unless there is a strong reason to introduce a new migration chain.
  - If you restore from a dump or recreate the DB at this revision, remember to re‑apply the same DDL before deploying this branch.
- 2026-01-02 (manual, at `ed57deb9c434`): add index to speed provider rating aggregates on reviews
  - SQL: `CREATE INDEX ix_reviews_artist_id ON reviews (artist_id);`
  - Rationale: `read_artist_profile_by_id` / `read_artist_profile_by_slug` aggregate rating/count on `reviews.artist_id`; the index avoids full scans during profile loads.

---

**This doc will help future contributors, new devs, and even yourself quickly grok all “smart” parts of the app.**
If you add new features (like analytics, webhook agents, etc.), just append new rows!

**Note:** This project is still in development (not live), so we do not maintain backwards compatibility for legacy data or endpoints; we prioritize the current, single-source implementations.

---

## Realtime Tail Render (Sacred Path)

The latest message must always appear instantly at the bottom of the open thread. The following code paths and behaviors are sacred — do not revert or remove them without reading `docs/CHAT_REALTIME_TAIL_RUNBOOK.md` and updating it.

- Files (keep behaviors intact):
  - `frontend/src/components/chat/MessageThread/hooks/useThreadData.ts`
    - Monotonic tail placement: newest id forced to tail if timestamp drifts.
    - Timestamp fallback to `now` when missing/invalid.
    - Tiny after_id delta reconcile (`fetchDelta`) + throttle.
    - Listener for `thread:pokedelta` to trigger delta fetch.
  - `frontend/src/components/chat/MessageThread/hooks/useThreadRealtime.ts`
    - Append minimal synthetic bubble on `thread_tail`.
    - Poke delta after `message` and `thread_tail`.
  - `frontend/src/components/chat/MessageThread/index.web.tsx`
    - Wire `fetchDelta` from `useThreadData` into `useThreadRealtime` via `pokeDelta`.
  - `frontend/src/components/chat/MessageThread/message/SystemMessage.tsx`
    - Do not hide booking‑details summaries (render compact CTA instead).
  - `frontend/src/hooks/useNotifications.tsx`
    - On active thread NEW_MESSAGE, add ephemeral stub and dispatch `thread:pokedelta`.
  - `frontend/src/hooks/useRealtime.ts`
    - `ws.onerror` logs only; `onclose` owns reconnect backoff (prevents thrash).

- Do not:
  - Remove the tail bump or timestamp fallback.
  - Remove delta reconcile paths (after WS, after notifications).
  - Reintroduce `return null` for booking‑details tails.
  - Close the socket inside `onerror` (causes unsubscribe/subscribe loops).

See `docs/CHAT_REALTIME_TAIL_RUNBOOK.md` for full context, rationale, and troubleshooting.

---

## Travel Engine (Sacred Path)

Travel estimates must always be driven by the frontend travel engine using Google Maps + the distance proxy. Do not change these behaviours without updating this doc and `README.md`’s “Driving Distance” / “Travel Mode Decision” sections.

- Files (keep behaviours intact):
  - `frontend/src/lib/travel.ts`
    - `getCoordinates()` uses Google Geocoding API with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
    - `getDrivingMetrics()` / `getDrivingMetricsCached()` talk to `/api/v1/distance?includeDuration=true` (Distance Matrix proxy) and parse both km + duration.
    - `calculateTravelMode()` owns the **single** decision for drive vs fly, including:
      - Nearest airport selection via `findNearestAirport()` using readable airport addresses.
      - Comparison of full flight cost (flights, transfers, car rental) vs driving (round‑trip).
      - Time‑cost penalty rules: max transfer hours, long‑drive forcing fly, drive comfort buffer, value‑of‑time adjustment.
      - When airports/routes cannot be resolved or are unsupported, derive driving cost from Distance Matrix (`distanceKm × travelRate × 2`) instead of ever returning 0.
  - `frontend/src/components/booking/BookingWizard.tsx`
    - Uses the provider’s base `location` (or service `details.base_location`) as `artistLocation`.
    - Calls `calculateTravelMode()` for the review step and persists its `mode` + `totalCost` on the booking request as `travel_mode` / `travel_cost` / `travel_breakdown`.
  - `frontend/src/lib/__tests__/travel.test.ts`
    - Encodes invariants for `calculateTravelMode()` and Distance Matrix usage so regressions are caught in CI.

- Do not:
  - Hard‑code travel costs, bypass `calculateTravelMode()`, or move its core logic into the backend.
  - Remove the Distance Matrix proxy (`/api/v1/distance`) or replace it with great‑circle only distance for booking estimates.
  - Allow travel cost to silently fall back to `0` when airports or flight routes are missing; always derive a drive estimate from Distance Matrix in those cases.

The booking/quote UX assumes travel is **always** computed via this path so numbers stay consistent between Review, quotes, and payments.

---

## Inline Quote Engines (Live vs Sound)

The inline quote forms in the chat are now split by **service type**; this split is routed centrally through `MessageThreadWrapper`. This is a sensitive integration point for all future service‑specific quote flows.

- Files (routing + engines):
  - `frontend/src/components/chat/MessageThreadWrapper.tsx`
    - Computes `effectiveBookingRequest = bookingRequestFull || bookingRequest` and uses it as the single source of truth for quotes, header, and side‑panel.
    - Quote modal chooses the inline form based on **service type + sound mode**:
      - Sound threads:
        - `service.service_category_slug` or `service.service_category.name` contains `"sound"`, **or**
        - `travel_breakdown.sound_mode === 'supplier'` (or equivalent in `sound_context`).
        - → Renders `SoundInlineQuote`.
      - Live / generic threads:
        - → Renders `LivePerformanceInlineQuote`.
    - Always passes `artistId`, `clientId`, `initialBaseFee`, and `initialTravelCost` from `effectiveBookingRequest` (not the partial `bookingRequest`) so the inline forms see hydrated data.
  - `frontend/src/components/chat/inlinequote/LivePerformanceInlineQuote.tsx`
    - Live‑performance (artist) quote form.
    - Uses `useLiveQuotePrefill` to:
      - Fetch the booking request.
      - Infer supplier‑mode (`isSupplierParent`) from `parent_booking_request_id` + `sound_mode`.
      - Call the **live quote engine** (`calculateQuoteBreakdown`) when appropriate to prefill:
        - Base fee (performance),
        - Artist travel,
        - Artist‑provided sound (when `sound_provisioning` is variable).
    - Renders “Base Fee”, “Travel”, and a “Sound Equipment” row (artist‑provided sound or supplier‑mode notice), plus Extras, Discount, Expiry, and Accommodation.
    - Submits a `QuoteV2Create` with `sound_fee` set to 0 when supplier‑mode is active (sound will be handled by a child thread).
  - `frontend/src/components/chat/inlinequote/SoundInlineQuote.tsx`
    - Sound‑provider quote form (child sound booking).
    - Uses `useSoundQuotePrefill` to:
      - Fetch the booking request.
      - Call the **sound estimate engine** (`calculateSoundServiceEstimate`) with:
        - Guest count, venue type, stage, lighting, rider units, backline.
      - Prefill:
        - Base “Sound package (full estimate)” from the audience package price,
        - Extras for stage/lighting/backline (one line per item),
        - Travel for the sound provider using their `details.base_location`, `travel.per_km_rate`, and Distance Matrix (`getDrivingMetricsCached`).
    - Does **not** render a separate “Sound Equipment” row; all sound value is in base + extras + travel.
    - Submits a `QuoteV2Create` with:
      - One “Sound package” service line plus extras,
      - `sound_fee = 0`,
      - `travel_fee` set from the provider travel prefill.
  - `frontend/src/components/chat/inlinequote/useLiveQuotePrefill.ts`
    - Live‑only prefill hook; owns all data/estimate logic for the artist path.
  - `frontend/src/components/chat/inlinequote/useSoundQuotePrefill.ts`
    - Sound‑only prefill hook; owns all data/estimate logic for the sound‑provider path.
- Engine locations:
  - Backend service types live under `backend/app/service_types/live_performance/estimate.py` and `backend/app/service_types/sound_service/estimate.py` (facaded by `backend/app/services/booking_quote.py`).
  - Frontend request helpers live under `frontend/src/lib/estimates/livePerformance.ts` and `frontend/src/lib/estimates/sound.ts`, with compatibility wrappers still exported from `frontend/src/lib/api.ts`.

- Why this matters (future services):
  - `MessageThreadWrapper` is the central **router** for inline quote engines. All new service types (video, corporate packages, etc.) should follow the same pattern:
    - One service‑type inline quote component (e.g., `VideoInlineQuote`).
    - One service‑type prefill hook (e.g., `useVideoQuotePrefill`) that calls into the correct backend estimate engine.
    - A clear routing rule in `MessageThreadWrapper` that chooses the component based on `effectiveBookingRequest` fields (service category, mode flags, etc.).
  - Bugs where a sound thread is mistakenly routed to the live form (or vice versa) can produce extremely confusing quotes (e.g., `Base Fee = 1.00` for a sound provider). When debugging mis‑quotes, always:
    - Confirm which inline component was rendered (Sound vs Live).
    - Check the routing condition in `MessageThreadWrapper` against `effectiveBookingRequest` for that thread.

Keep this split in mind when adding new services: do not push new quote logic back into a single generic inline form. Instead, add a new engine + inline component and extend the routing logic explicitly.

---

## Inbox Preview Performance (Nov 2025)

We cut the preview route latency by ≈10× without changing the JSON contract.

- What changed
  - Single‑query preview composition under `backend/app/api/api_threads.py:get_threads_preview`:
    - Latest visible message per thread via window function (rn=1) filtered by viewer visibility (BOTH + viewer).
    - Join directly onto `booking_requests` filtered by the viewer; order by `last_ts` and apply `limit` in the same query.
    - Load minimal counterparty details via `selectinload` and only `service.service_type` for PV logic.
    - Removed the follow‑up recent‑messages fetch and the accepted‑quote lookup for preview.
  - Preserved PV semantics: include only PV threads that have “Payment received”.
  - Labels/keys: still use `preview_label_for_message`; restored `preview_key`/`preview_args` for booking_details, payment_received, event_reminder.
  - Kept everything else the same: JSON shape, ETag, Server‑Timing, and orjson serialization.

- Results (Server‑Timing)
  - Before: `brs≈4355ms` (composition dominated), `ser≈0.1ms`.
  - After: `brs≈435ms`, `unread≈60ms`, `build≈27ms`, `ser≈0.2ms`. End‑to‑end TTFB now mostly network/TLS.

- Next steps
- Client: persist ETag and send `If-None-Match` on first load; render from cache immediately.
- Server: Redis ephemeral preview cache (per user+role+limit) updated on events; serve cached bytes + stored ETag for near-instant previews across instances.

See `backend/app/api/THREADS_PREVIEW_OPTIMIZATION.md` for details.

## Artist Dashboard Booking Requests (Dec 2025)

- What broke
  - The artist dashboard “Requests to me” panel calls `GET /api/v1/booking-requests/me/artist`. When at least one booking request had `QuoteV2` rows attached, this endpoint began 500’ing with `"'dict' object has no attribute '_sa_instance_state'"`.
  - Root cause: both `/me/client` and `/me/artist` paths were mutating the ORM `BookingRequest.quotes` relationship to hold **dicts** from `_prepare_quotes_for_response(...)` instead of `QuoteV2` entities, so SQLAlchemy’s relationship manager blew up when it tried to treat those dicts as instances.

- Fix (backend)
  - File: `backend/app/api/api_booking_request.py`
    - `read_my_client_booking_requests()`:
      - Still uses `crud_booking_request.get_booking_requests_with_last_message(...)` for list composition and preserves the `lite` path via `_to_lite_booking_request_response(...)`.
      - For the full (non-lite) response, it no longer assigns dicts into `req.quotes`. Instead it:
        - Calls `_prepare_quotes_for_response(list(req.quotes or []))` to build enriched quote payloads.
        - Builds a Pydantic `BookingRequestResponse` via `BookingRequestResponse.model_validate(req)`.
        - Overlays the enriched quotes on the response model using `model_copy(update={"quotes": quotes_data})`.
      - Per-row validation failures are logged and skipped so one bad request doesn’t take down the whole list.
    - `read_my_artist_booking_requests()`:
      - Uses the same pattern as the client path: fetches ORM rows via `get_booking_requests_with_last_message(...)`, normalizes `created_at`/`updated_at`, then builds per-request `BookingRequestResponse` models with enriched `quotes` via `model_validate(...).model_copy(...)`.
      - Wrapped the body in a `try/except` that logs a full traceback and context (`artist_id`, `skip`, `limit`) and returns a structured 500 via `error_response(...)` when an unexpected error occurs. This makes production failures debuggable without crashing the entire task tree.

- Why this matters
  - ORM instances remain “clean” (no dicts in relationship attributes), which avoids SQLAlchemy invariants breaking in future refactors.
  - The response contract stays strongly typed through Pydantic (`BookingRequestResponse` with `quotes: List[QuoteRead]`), and quote preview enrichment lives at the serialization layer instead of leaking back into the model.
  - The artist dashboard can safely show booking requests (including those with quotes) without 500s, and logs now include enough context to trace any future edge cases.

## Realtime on Non-Chat Pages (Design Intent)

- The header and layout intentionally keep realtime wiring active on **all** authenticated routes, not only `/inbox` or thread views.
  - Files:
    - `frontend/src/contexts/chat/RealtimeContext.tsx` — single global `RealtimeProvider` owning the WS/SSE connection and `unread_total` updates.
    - `frontend/src/components/layout/MainLayout.tsx` — maintains a lightweight SSE `/api/v1/inbox/stream?role=artist|client` outside the Inbox route for unread snapshots (kept, not removed).
    - `frontend/src/components/layout/Header.tsx` and `frontend/src/components/layout/MobileBottomNav.tsx` — consume unread counts to surface message badges in the header and mobile nav.
- This is **by design**: providers should see new-message badges while they are on dashboard, profile, or other non-chat pages, without having the Inbox open.
- Do not “optimize away” the header’s realtime WS/SSE on non-chat routes purely for perceived performance; any changes here must preserve:
  - Global awareness of new messages via header/bottom-nav badges.
  - Reliable `unread_total` updates from the backend (`inbox:unread_total` events) even when the Inbox UI is not active.

## Threads Preview Roles (Dec 2025)

- `GET /api/v1/message-threads/preview` supports `role=client`, `role=artist`, and `role=auto`.
- `role=client` — threads where the current user is the client; preview is built from messages visible to the client.
- `role=artist` — threads where the current user is the artist; preview is built from messages visible to the artist.
- `role=auto` — threads where the user is either client or artist (`booking_requests.client_id = me OR booking_requests.artist_id = me`); per-thread visibility:
  - include messages when `visible_to = BOTH`,
  - or `visible_to = CLIENT` and `client_id = me`,
  - or `visible_to = ARTIST` and `artist_id = me`.
- JSON shape, PV filters, labels, and ETag semantics are identical for all roles; only the thread set changes.
- Inbox behavior:
  - Clients (`user_type = client`) use `role=client`.
  - Service providers (`user_type = service_provider`) use `role=auto` so providers who previously booked as clients see both legacy client threads and new provider threads in one list.

## UI Tokens (Jan 2026)

- Added a shared token set (`frontend/src/theme/tokens.ts`) for colors/radii/spacing/typography, plus status/payout/table helpers.
- Status chips/badges and payout badges now use token-based helpers (`statusChipStyles`, `payoutStatus`), reducing hardcoded Tailwind.
- Common UI primitives (Button variants, Chip, Tag, PillButton, Card, Section, EmptyState, payouts table headers/cells) are tokenized for reuse across web and future React Native surfaces.
- Tests were aligned to current behavior (auth guard messages, local date formatting) and button variant shape. The network guard is stubbed in `api.test.ts` to keep tests focused on app logic.

## Shared Logic Extraction (Jan 2026, in progress)

- Goals: make key helpers portable for RN (pure TS, no DOM/React), reduce drift between web and native.
- Done:
  - Moved live/sound quote estimators to pure shared modules: `frontend/src/lib/shared/estimates/{livePerformance,sound}.ts` (used by `lib/api.ts`).
  - Added shared date formatter `formatDateYMDLocal` in `frontend/src/lib/shared/date.ts` and wired `lib/api.ts`/`lib/urlParams.ts`.
  - Centralized phone validation in `frontend/src/lib/shared/validation/phone.ts` (re-exported via `lib/phoneValidation.ts`).
  - Booking wizard validation/mappers extracted to `frontend/src/lib/shared/validation/booking.ts` + `bookingSchema.ts` (step field map, unavailable-date guard, guest/event normalizers). Wizard now imports these helpers instead of inline definitions.
  - Inline quote payload builders extracted to `frontend/src/lib/shared/quotes/builders.ts` (live + sound). Web inline quote forms now call these pure helpers so RN can reuse the same payload shaping.
  - Location/media display mappers extracted to `frontend/src/lib/shared/mappers/location.ts` (city/region formatting, hero media picker, distance formatter); service/provider cards and client/profile views now consume these helpers.
  - Introduced a thin, pluggable API client wrapper (`apiClient` in `frontend/src/lib/api.ts`) with overridable transport for RN; new calls (e.g., service-provider list fetch) use the wrapper instead of raw axios.
- Planned next steps:
  - Introduce a thin `apiClient` wrapper (pluggable transport) and shared DTO/schemas under `frontend/src/types/api` + `frontend/src/schemas/`.
  - Add a short flow doc for booking + inline quote navigation; define platform-neutral adapters for realtime/notifications/storage.
