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
| **Personalized Video** | Automates Q&A for custom video requests | `frontend/src/components/booking/bookinwizardpersonilsedvideo.tsx`<br>`frontend/src/features/booking/personalizedVideo/engine/` | When `service_type` is Personalized Video |
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
* **Frontend (current flow):**
  - UI surfaces live in `frontend/src/components/booking/bookinwizardpersonilsedvideo.tsx`:
    - Booking sheet (`BookinWizardPersonilsedVideo`) for date/length/language/recipient/promo.
    - Payment page (`VideoPaymentPage`) for Paystack/demo payments.
    - Brief page (`VideoChatBrief`) for Q&A/autosave and “ready for production”.
  - All three surfaces are thin and share a single headless engine:
    - `usePersonalizedVideoOrderEngine` in `frontend/src/features/booking/personalizedVideo/engine/engine.ts`.
* **Frontend engine (headless “brain”):**
  - Engine contracts live in `frontend/src/features/booking/personalizedVideo/engine/types.ts` (`PersonalizedVideoEngineState`, actions, params).
  - HTTP integration and storage are encapsulated behind:
    - `apiClient.ts` — `VideoOrderApiClient` (`/video-orders` CRUD, brief answers, thread linkage, SYSTEM messages).
    - `storage.ts` — `PersonalizedVideoStorage` (`vo-sim-*`, `vo-thread-*`, `vo-order-for-thread-*`, `vo-brief-seed-*`, `vo-ans-*`, `vo-brief-complete-*` keys).
  - Core domain logic is platform‑agnostic:
    - `core.ts` exports `createPersonalizedVideoEngineCore(env, params)` which owns:
      - Draft → order creation (real or simulated) + initial thread + brief seed.
      - Availability checks (via a small `availability` env).
      - Payment lifecycle (reload order, Paystack/demo via `payments` env, mark paid, SYSTEM “Payment received”).
      - Brief lifecycle (autosave, posting answers, status → `in_production`, SYSTEM “Brief complete” + navigation).
    - `engine.ts` is a React Web wrapper that wires:
      - `env.api` to `videoOrderApiClient`.
      - `env.storage` to `pvStorage`.
      - `env.availability` to `getServiceProviderAvailability(...)`.
      - `env.ui` to Next.js router + Toasts.
      - `env.payments` to the Paystack inline script (or demo mode when not configured).
  - The Personalized Video flow is now the reference implementation for “engine‑driven” booking flows on the frontend.
  - Personalized Video service config (details.base_length_sec, long_addon_price, languages) is authored via the add-service engine (see serviceTypeRegistry) and read into booking via `fromServiceToPvBookingConfig(...)`.


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
  - `api_threads.get_threads_preview()` and `api_threads.get_threads_index()` ensure that when the “client” in a conversation is a BSP/service provider (has an `artist_profile.business_name`), provider-facing thread previews and payloads use the BSP business name and avatar instead of the personal name; the inbox list (`frontend/src/components/chat/MessageThread/ConversationList.tsx`) and thread header (`frontend/src/components/chat/MessageThreadWrapper.tsx`) consume these fields so branding is consistent.
* **Outcome:** Thread list and thread headers stay clean, consistently branded (business name when available), and actionable, and users are guided inside the chat without over-notifying.


### 17. Calendar Sync Agent (Sacred Path)

* **Purpose:** Keep artist availability in sync with their Google Calendar without ever silently disconnecting once linked.
* **Backend:** `backend/app/api/api_calendar.py` and `backend/app/services/calendar_service.py` handle OAuth, token storage, and event fetches.
* **Connection lifecycle:**
  - When a provider connects Google Calendar via the Edit Profile flow, `exchange_code()` persists a `CalendarAccount` row with `refresh_token`, `access_token`, `token_expiry`, and optional `email`. A successful exchange marks `status="ok"` and records `last_success_sync_at`.
  - `fetch_events(user_id, start, end, db)` is **best-effort**:
    - If Google libs or credentials are missing, or no `CalendarAccount` exists, it logs and returns `[]`.
    - If the access token is expired, it attempts a refresh:
      - On success, it updates `access_token` / `token_expiry`, marks `status="ok"`, clears `last_error`, and updates `last_success_sync_at`.
      - On `RefreshError` (invalid/expired refresh token), it **never** deletes `CalendarAccount`; instead it sets `status="needs_reauth"`, updates `last_error` / `last_error_at`, logs, and returns `[]`.
    - On Google API errors (`HttpError`) or unexpected exceptions, it marks `status="error"` with a coarse `last_error` value and returns `[]`.
  - The only way to fully remove a calendar link is `DELETE /api/v1/google-calendar`, which explicitly deletes the `CalendarAccount`.
* **Availability integration:**
  - `read_artist_availability` uses `fetch_events(...)` inside a try/except and treats failures as “no external events” so booking flows never 5xx because of Google.
- Calendar events are merged into `unavailable_dates`, but failures simply mean those external blocks are temporarily omitted; app-side bookings still work.
* **Do not:**
  - Delete `CalendarAccount` automatically in `fetch_events` or any background job when refresh fails.
  - Surface HTTP 5xx to clients solely because the calendar refresh or Google API failed.
  - Flip a connected account back to “disconnected” state without an explicit user-initiated disconnect.

### Calendar Slot Duration (Musician Services – Future Tuning)

- For musician Personalized Video and Custom Song services, `services.duration_minutes` is currently set using simple heuristics derived from `details.base_length_sec` (e.g., short vs long content mapped to 40/75/60/120 minutes).
- These values are good enough for pricing and rough availability, but they are **not yet a precise calendar slot model**:
  - PV: `base_length_sec ≈ 40/75` maps to a single “slot” length for now.
  - Custom Song: `base_length_sec` (≈60/120 seconds of audio) is mapped to a longer booking duration (60/120 minutes) to reflect production time, not finished track length.
- When we do a calendar/slot revamp, revisit:
  - Whether `duration_minutes` should represent **calendar block length**, **content length**, or both via separate fields.
  - How PV/Custom Song durations interact with `read_artist_availability` and any future per-service slot templates (e.g., “max N PV orders per day”).
  - Keeping Booking + Add Service engines as the only place that derive these values so web/RN stay in sync.


## Engine Pattern for Future Booking Services

New booking‑style services (e.g. “book a slippery slide”) should follow the same engine structure as Personalized Video so that web, mobile, and future clients can all share one headless “brain”:

* **Feature folder layout (frontend):**
  - `frontend/src/features/booking/<serviceSlug>/engine/`
    - `types.ts` — domain types and engine contracts (`<Service>EngineState`, actions, params).
    - `apiClient.ts` — service‑specific API calls (e.g. `/slippery-slide-orders`, `/quotes`, `/availability`).
    - `storage.ts` — service‑specific persistence keys (localStorage/AsyncStorage for drafts, seeds, answers).
    - `core.ts` — pure TypeScript core (`create<CapitalizedService>EngineCore(env, params)`) with:
      - Draft state machine, validation, availability integration.
      - Quote/pricing and order/booking creation logic.
      - Payment and brief/additional‑info flows (if applicable).
    - `engine.ts` — React Web hook (`use<CapitalizedService>Engine`) that:
      - Instantiates the core with a Web `env` (API client, storage, router, toasts, Paystack/Stripe, etc.).
      - Exposes `{ state, actions }` to UI components.
* **Example for a future “Booked Slippery Slide” service:**
  - `frontend/src/features/booking/slipperySlide/engine/types.ts`
  - `frontend/src/features/booking/slipperySlide/engine/apiClient.ts`
  - `frontend/src/features/booking/slipperySlide/engine/storage.ts`
  - `frontend/src/features/booking/slipperySlide/engine/core.ts` (exports `createSlipperySlideEngineCore(env, params)`).
  - `frontend/src/features/booking/slipperySlide/engine/engine.ts` (exports `useSlipperySlideEngine`).
* **UI components** for new services should be thin shells:
  - Live under `frontend/src/components/booking/...` or `frontend/src/features/booking/<serviceSlug>/ui/`.
  - Read only from `engine.state` and call `engine.actions.*` (no direct API/localStorage/Paystack usage).

## Add Service Engine (current coverage)

* **Canonical engine + registry**: `frontend/src/features/serviceTypes/addService/{types,serviceTypeRegistry,apiClient,core,engine}.ts` is the single source of truth for service types, fields, and payload mapping.
* **Musician category (router + flows)**:
  - Router: `frontend/src/components/dashboard/add-service/musician/MusicianAddServiceRouter.tsx` (4 options).
  - Flows: Live (`MusicianLivePerformanceFlow` → `serviceType: "live_performance_musician"`), PV (`MusicianPersonalizedVideoFlow`), Custom Song, Other (all use `useAddServiceEngine`).
  - Registry entries: `live_performance_musician`, `personalized_video`, `custom_song`, `other`.
* **Sound category**:
  - Flow: `frontend/src/components/dashboard/add-service/sound/SoundServiceFlow.tsx` (engine-driven).
  - Registry entry: `sound_service_live`.
* **Booking mappers**:
  - PV: `fromServiceToPvBookingConfig(...)` (feeds PV booking engine).
  - Live: `fromServiceToLiveBookingConfig(...)` (used in BookingWizard).
  - Custom Song: `fromServiceToCustomSongBookingConfig(...)` (ready for future booking flow).


This pattern keeps booking behaviour centralized, makes React Native and other clients easier to support (by swapping only the `env` layer), and avoids duplicating complex business rules in components.




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

### Realtime Transport Note (WS + SSE hardening, 2025-12-09)

- Envelope compatibility and heartbeat payloads:
  - `backend/app/api/api_ws.py:Envelope.from_raw` now lifts any unknown top-level keys (`interval`, etc.) into `payload` when an explicit `payload` object is missing so older/newer clients remain compatible.
  - Heartbeat frames sent from the frontend (`{ v:1, type:'heartbeat', interval }`) are now parsed via this path and clamped server-side to a safe interval window.
- WebSocket DB concurrency:
  - `backend/app/api/api_ws.py:_ws_db_call` now uses an `asyncio.BoundedSemaphore` (`WS_DB_CONCURRENCY`) and `run_in_threadpool` so WS auth/room checks never block the event loop while waiting for a DB slot.
  - Recommended env: `WS_DB_CONCURRENCY≈2` per process when `DB_POOL_SIZE=6`, so WS cannot starve the main pool.
- WebSocket heartbeat and timeouts:
  - All WS endpoints (`/api/v1/ws`, `/api/v1/ws/booking-requests/{id}`, `/api/v1/ws/notifications`) share a pinger driven by the client’s requested heartbeat interval (desktop ~30s, mobile ~60s).
  - The server clamps heartbeat between 30s and 120s and computes a pong timeout as `max(PONG_TIMEOUT, interval+15s)` so mobile heartbeats do not self‑timeout.
  - On repeated heartbeat failures the server closes with `1011` (“internal error / pong timeout”); it no longer sends `1006` in a close frame.
- WebSocket auth and Origin:
  - `_log_ws_auth_failure` now logs only the URL path (no querystring) to avoid leaking `?token=` values into logs.
  - `_enforce_ws_origin` reads `WS_ALLOWED_ORIGINS` (comma‑separated, scheme+host+optional port) and rejects cross‑origin WS opens with `4403` when cookies can authenticate the socket; this protects against Cross‑Site WebSocket Hijacking.
- Noise encryption:
  - `ENABLE_NOISE` remains opt‑in and is now gated by an explicit `Sec-WebSocket-Protocol: noise` subprotocol; without that, `NoiseWS.handshake()` accepts a plain TLS‑wrapped WS even when Noise libs are present.
  - The XX responder handshake is completed (client_hello → server_hello → client_finish). On failure the server closes with `1002` (`noise handshake failed`) rather than falling back to treating ciphertext as JSON.
- Frontend realtime client:
  - `frontend/src/hooks/useRealtime.ts` continues to manage a single global WS per tab; it now:
    - Sends one `subscribe` per topic when the first handler attaches and one `unsubscribe` when the last handler detaches, so multiple consumers can safely share a topic.
    - Caps the offline outbox at ~200 pending envelopes; when WS is down, older publishes are dropped to bound memory.
  - `frontend/src/components/chat/MessageThread/hooks/useThreadRealtime.ts`:
    - Uses real `useRef` state for debounced delivered acks and clears its timer on unmount, so no “stray” PUTs fire after a thread is destroyed.
    - Still dedupes realtime messages by `id` via a per‑thread `__threadSeenIds` map and uses small delayed `pokeDelta` triggers (`thread:pokedelta`) to maintain tail correctness.

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
- 2026-01-10 (manual, at `ed57deb9c434`): add optional geocoded coordinates for provider base locations
  - SQL:
    - `ALTER TABLE service_provider_profiles ADD COLUMN location_lat numeric(9, 6) NULL;`
    - `ALTER TABLE service_provider_profiles ADD COLUMN location_lng numeric(9, 6) NULL;`
    - `CREATE INDEX ix_service_provider_profiles_location_lat ON service_provider_profiles (location_lat);`
    - `CREATE INDEX ix_service_provider_profiles_location_lng ON service_provider_profiles (location_lng);`
  - Rationale: allows `/api/v1/service-provider-profiles` to implement a true "Closest first" sort using the provider's base location without changing the existing human-readable `location` string. Providers without coordinates remain eligible but are ordered after those with coordinates.
- 2026-01-10 (manual, at `ed57deb9c434`): add calendar account health metadata so Calendar Sync never implicitly disconnects
  - SQL:
    - `ALTER TABLE calendar_accounts ADD COLUMN status varchar NULL;`
    - `ALTER TABLE calendar_accounts ADD COLUMN last_error text NULL;`
    - `ALTER TABLE calendar_accounts ADD COLUMN last_error_at timestamp NULL;`
    - `ALTER TABLE calendar_accounts ADD COLUMN last_success_sync_at timestamp NULL;`
  - Rationale: allows the app to retain `calendar_accounts` rows even when Google rejects refresh tokens or APIs fail, marking connections as needing attention instead of deleting them. This ensures providers never "lose" their linked calendar unless they explicitly disconnect it from the profile.
- 2026-01-15 (manual, at `ed57deb9c434`): add generic service_extras JSON payload for booking-specific engines (e.g. Personalized Video orders)
  - SQL:
    - `ALTER TABLE booking_requests ADD COLUMN service_extras JSON;`
  - Rationale: provides a namespaced JSON envelope (`booking_requests.service_extras`) where engine-driven services like Personalized Video can persist order payloads (`service_extras->'pv'`) without overloading travel-specific fields. This keeps booking_requests as the chat/thread spine while allowing each service engine to attach its own structured data.

---

**This doc will help future contributors, new devs, and even yourself quickly grok all “smart” parts of the app.**
If you add new features (like analytics, webhook agents, etc.), just append new rows!

**Note:** This project is still in development (not live), so we do not maintain backwards compatibility for legacy data or endpoints; we prioritize the current, single-source implementations.

---

## Realtime Tail Render (Sacred Path)

The latest message must always appear instantly at the bottom of the open thread. The following code paths and behaviors are sacred — do not revert or remove them without reading `docs/CHAT_REALTIME_TAIL_RUNBOOK.md` and updating it.

- Files (keep behaviors intact):
  - `backend/app/api/api_threads.py`
    - `get_threads_preview()` / `get_threads_index()` compute counterparty labels and avatars for inbox previews and thread payloads, including BSP/client branding rules described in the Inbox Guide Agent (providers see the BSP/business name + logo when the “client” has an `artist_profile.business_name`).
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
  - `frontend/src/components/chat/MessageThread/ConversationList.tsx` / `frontend/src/components/chat/MessageThreadWrapper.tsx`
    - Respect the counterparty name/avatar computed by the Inbox Guide + threads APIs so BSP/business branding stays consistent between inbox list, thread header, and booking summary.
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

## Artist Dashboard Performance (Services + Bookings, Jan 2026)

- Artist booking‑requests:
  - `backend/app/api/api_booking_request.py:read_my_artist_booking_requests` now mirrors the client path with:
    - `lite` mode, paging (`skip/limit`), and weak ETag support keyed by artist id + max id + count + paging + lite flag.
    - Lite responses built via `_to_lite_booking_request_response`, which keep enough data for list views (client, provider profile, service summary, status, preview) while omitting heavy nested relations and full quote payloads.
  - `frontend/src/lib/api.ts:getBookingRequestsForArtistCached` calls `/api/v1/booking-requests/me/artist?lite=true&limit=100` with `If-None-Match`, so artist dashboards and booking‑requests lists reuse cached bodies or 304s instead of pulling multi‑MB payloads on every visit.
- Artist bookings:
  - `backend/app/api/api_booking.py:read_artist_bookings` now supports `skip`, `limit`, optional `status` filter (`upcoming`/`past` or specific status), and ETag, using the same invoice + payment join pattern as `read_my_bookings`.
  - The cached helper `getMyArtistBookingsCached` in `frontend/src/lib/api.ts` now passes `limit=100` and ETags, so the dashboard only fetches a bounded window of recent bookings.
- Services tab (provider dashboard):
  - `frontend/src/hooks/useArtistDashboardData.ts` now fetches services (`/api/v1/services/mine`) in parallel with the heavier dashboard calls and tracks a separate `servicesLoading` flag.
  - `frontend/src/app/dashboard/artist/page.tsx` passes `servicesLoading` into `ServicesSection`, so the Services tab can render the provider’s service list as soon as `/services/mine` returns instead of waiting on slower booking/booking‑request queries.

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

## Communications & Notifications (Email, WhatsApp, In‑App)

This section documents how all user‑facing communications are wired — emails, WhatsApp, and in‑app notifications — and where to look when debugging.

- **Core notification pipeline**
  - Backend entrypoint: `backend/app/utils/notifications.py`
    - `_create_and_broadcast(...)` — persists `Notification` rows and broadcasts them via WebSocket/SSE using `notifications_manager`.
    - `_build_response(...)` — enriches notification JSON with sender name, avatar, booking/request context for the frontend.
    - `format_notification_message(...)` — converts `NotificationType` + kwargs into human‑readable strings.
  - Realtime delivery:
    - `backend/app/api/api_notification.py` — CRUD + list endpoints for notifications.
    - `backend/app/api/api_threads.py` — inbox preview + `/api/v1/inbox/stream` event source; emits `inbox:unread_total`, `threads:preview`, and message deltas.
    - `frontend/src/contexts/chat/RealtimeContext.tsx` — owns the single WS/SSE connection and distributes events.
    - `frontend/src/hooks/useNotifications.ts` — subscribes to notification events, applies local state updates and badges.
    - `frontend/src/components/layout/Header.tsx`, `frontend/src/components/layout/MobileBottomNav.tsx` — display unread badges and menu indicators.

- **Email sending**
  - Plain SMTP:
    - `backend/app/utils/email.py:send_email` — sends simple text emails via the `SMTP_*` env settings (used by magic‑link flow and generic alerts).
  - Mailjet templates over SMTP:
    - `backend/app/utils/email.py:send_template_email` — sends Mailjet template emails using `X-MJ-TemplateID` and `X-MJ-Vars` headers.
    - Booking/quote/payment templates:
      - New booking request to provider: `MAILJET_TEMPLATE_NEW_BOOKING_PROVIDER` (default `7527677`), used in `notify_user_new_booking_request`.
      - Client received quote: `MAILJET_TEMPLATE_NEW_QUOTE_CLIENT`, used in `notify_client_new_quote_email`.
      - Booking confirmed (provider/client): `MAILJET_TEMPLATE_BOOKING_CONFIRMED_PROVIDER` / `MAILJET_TEMPLATE_BOOKING_CONFIRMED_CLIENT`, used in the payment/booking confirmation paths.
  - Magic login emails:
    - `backend/app/api/api_magic.py:request_magic_link`:
      - Accepts `{ email, next? }`, auto‑provisions a minimal client account if none exists.
      - Issues a short‑lived JWT with `typ="magic"` and optional `next` URL, then builds a link:
        - `FRONTEND_URL.rstrip('/') + "/magic?token=<jwt>"`
      - Sends a plain‑text email via `send_email(recipient=user.email, subject="Your sign-in link", body="Click to sign in: <link>")`.
      - In `EMAIL_DEV_MODE` it also returns the `magic_link` in the JSON response for easy local testing.
    - `backend/app/api/api_magic.py:consume_magic_link`:
      - POST `/auth/magic-link/consume` with `{ "token": "<jwt>" }` from the frontend (typically from `/magic` page).
      - Verifies the JWT, looks up the user by normalized email, and if found:
        - Mints a normal access token (same semantics as password login).
        - Creates and stores a refresh token via `_create_refresh_token` / `_store_refresh_token`.
        - Sets **both** access and refresh cookies on the response (`_set_access_cookie`, `_set_refresh_cookie`) so the browser session is logged in.
      - Returns JSON `{ "ok": true, "next": <next or FRONTEND_URL> }`. The frontend should:
        - Call `/auth/magic-link/consume` from `/magic?token=...`,
        - Then read the `next` value from the JSON and route the user (usually via `router.replace(next)`).
      - If the magic link “does not log the user in”, it is usually because the frontend never calls `/auth/magic-link/consume` or ignores the success payload; the backend **does** set cookies when the consume endpoint is invoked successfully.

- **WhatsApp (Cloud API)**
  - Config:
    - `WHATSAPP_ENABLED` — `"1"/"true"/"yes"` to enable sending.
    - `WHATSAPP_PHONE_ID` — Meta phone number ID (not the MSISDN).
    - `WHATSAPP_TOKEN` — long‑lived WhatsApp Cloud API bearer token.
  - Helpers in `backend/app/utils/notifications.py`:
    - `_send_whatsapp_text(phone, body, preview_url=True)` — simple text sends (used for earlier experiments; not template‑aware).
    - `_send_whatsapp_template(phone, template_name, language_code, body_params, header_image_url?, button_url_param?)` — sends approved templates:
      - Normalizes the `phone` to E.164, builds a `template` payload, and POSTs to `https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_ID}/messages`.
      - When `header_image_url` is set and the template header type is **Image**, adds a `header` component:
        - `image.link = FRONTEND_URL + "/booka_logo.jpg"` (logo lives at `frontend/public/booka_logo.jpg`).
      - Adds a `body` component with text parameters in the exact order expected by the template.
      - When `button_url_param` is set, adds a `button` component with `sub_type="url"`/`index="0"` and a single text parameter, used for dynamic `{{1}}` URL placeholders.
    - `notify_user_new_booking_request(...)`:
      - Entry point in `backend/app/utils/notifications.py`; now a thin facade that delegates to the booking‑request intent.
      - In‑app notification + SMS as before.
      - Mailjet provider email via `MAILJET_TEMPLATE_NEW_BOOKING_PROVIDER`.
      - WhatsApp template `new_booking_request1` to the provider with:
        - Body variables mapped to:
          - `{{1}}` — provider name.
          - `{{2}}` — client name.
          - `{{3}}` — service name / booking type.
          - `{{4}}` — event date.
          - `{{5}}` — location.
          - `{{6}}` — guest count (from `travel_breakdown.guests_count`).
          - `{{7}}` — estimate amount (service price).
        - Header image: Booka logo via `FRONTEND_URL + "/booka_logo.jpg"` (asset: `frontend/public/booka_logo.jpg`).
        - Button: “View Request” pointing at `https://booka.co.za/inbox?requestId={{1}}` with `{{1}} = booking_request.id` (passed via `button_url_param`).
      - All WhatsApp sends are **best effort**: failures are logged but do not block the request or other channels (email/SMS/in‑app).

- **Notification intents vs channel helpers**
  - Intent modules live under `backend/app/notifications/intents/` and own all channels (in‑app, email, SMS, WhatsApp) for a single business event:
    - `booking_request.py` — “new booking request” to providers (in‑app, SMS, Mailjet provider email, WhatsApp template).
    - `quote.py` — quote lifecycle (new quote email to client, quote accepted/expiring/expired, “quote requested” nudges).
    - `booking_lifecycle.py` — new bookings, booking status updates, booking‑confirmed emails (client + provider), review request prompts.
  - `backend/app/utils/notifications.py` now primarily:
    - Exposes `notify_*` entrypoints as thin facades that delegate into the appropriate intent module (e.g. `notify_user_new_booking_request`, `notify_quote_accepted`, `notify_new_booking`).
    - Hosts shared channel helpers: `_create_and_broadcast` (in‑app + WS), `_send_sms`, `_send_whatsapp_template`, and `format_notification_message`.

- **In‑app vs system messages**
  - In‑app notifications:
    - Represented by `Notification` rows; driven by helper functions in `backend/app/utils/notifications.py` (e.g. `notify_user_new_message`, `notify_new_booking`, `notify_quote_accepted`, `notify_review_request`), which in turn call the relevant intent modules.
    - Delivered to clients via `/api/v1/notifications` and `/api/v1/inbox/stream`.
  - System chat messages:
    - Created in booking/message flows (e.g. booking details, event finished, auto‑completed, review prompts) and stored as `Message` rows with `message_type=SYSTEM`.
    - Centralized in `backend/app/services/ops_scheduler.py` for pre‑ and post‑event flows using `_post_system(...)`, which both inserts the message and calls `notify_user_new_message` when appropriate.
    - Rendered in the inbox/thread UI via `frontend/src/components/chat/MessageThread/message/SystemMessage.tsx` with consistent styling and CTA patterns.

When adding new communications (e.g., additional WhatsApp templates, new Mailjet flows, or app‑only nudges), prefer to:

- Add a new or extended intent in `backend/app/notifications/intents/` for that business event (e.g. `payout.py`, `review.py`) and call it from a small `notify_*` facade in `backend/app/utils/notifications.py`.
- Keep transport‑level helpers (email/SMS/WhatsApp) in `backend/app/utils/notifications.py` or dedicated channel modules so intents stay focused on business context and template variables.
- Use `backend/app/services/ops_scheduler.py` + `_post_system(...)` for time‑based **system chat messages** that should also notify via `notify_user_new_message` when appropriate.
- Expose any new client‑visible notification types via `NotificationType` and the existing `/notifications` + `/inbox/stream` paths.
- Update this section with the new flow, template IDs, and key files so future debugging starts from a single place.
