# AGENTS.md
Documentation for the automation modules ("agents") that power the booking application.
For setup instructions see [README.md](README.md).

---

## Agents Overview

| Agent | Purpose | Key files | Trigger |
|-------|---------|-----------|---------|
| **Booking Request** | Orchestrates the booking wizard and business rules; queues form steps offline and retries when back online | `backend/app/api/api_booking_request.py`<br>`frontend/src/components/booking/BookingWizard.tsx` | When a client submits or updates a booking |

| **NLP Booking** | Extracts event details and event type from natural language descriptions | `backend/app/services/nlp_booking.py`<br>`backend/app/api/api_booking_request.py`<br>`frontend/src/components/booking/BookingWizard.tsx` | When a client provides a free-form event description |

| **Provider Matching** | Selects sound and accommodation providers | `backend/app/crud/crud_service.py`<br>`backend/app/api/api_service.py` | During booking and quote steps |
| **Travel & Accommodation** | Calculates travel distance, lodging costs, and now weather forecasts | `backend/app/services/booking_quote.py`<br>`backend/app/api/api_weather.py` | When estimating travel or lodging expenses |
| **Quote Generator** | Gathers performance, provider, travel, and accommodation costs | `backend/app/api/api_quote.py`<br>`frontend/src/components/booking/MessageThread.tsx` | After all booking info is entered |
| **Quote Preview** | Shows an estimated total during the review step | `frontend/src/components/booking/wizard/Steps.tsx` | Right before submitting a booking request |
| **Review** | Manages star ratings and comments for completed bookings | `backend/app/api/api_review.py`<br>`frontend/src/app/service-providers/[id]/page.tsx` | After a booking is marked completed |
| **Payment** | Handles deposit or full payments via `/api/v1/payments` | `backend/app/api/api_payment.py` | After quote acceptance |
| **Notification** | Sends emails, chat alerts, and booking status updates | `backend/app/api/api_notification.py`<br>`backend/app/utils/notifications.py`<br>`frontend/hooks/useNotifications.ts` | On status changes, messages, actions |
| **Chat** | Manages client–artist chat and WebSocket updates; queues offline messages and retries with exponential backoff, batches typing indicators, lengthens heartbeats on mobile or hidden tabs, coalesces presence updates, and defers image previews until opened | `backend/app/api/api_message.py`<br>`backend/app/api/api_ws.py`<br>`frontend/src/components/booking/MessageThread.tsx` | Always on for active bookings |
| **Caching** | Caches artist lists using Redis | `backend/app/utils/redis_cache.py`<br>`backend/app/api/v1/api_service_provider.py` | On artist list requests |
| **Personalized Video** | Automates Q&A for custom video requests | `frontend/src/components/booking/PersonalizedVideoFlow.tsx`<br>`frontend/src/lib/videoFlow.ts` | When `service_type` is Personalized Video |
| **Availability** | Checks artist/service availability in real time | `backend/app/api/v1/api_service_provider.py`<br>`frontend/src/components/booking/BookingWizard.tsx` | On date selection and booking start |
| **Form State** | Maintains booking progress across steps | `frontend/src/components/booking/BookingWizard.tsx`<br>`frontend/src/components/booking/wizard/Steps.tsx`<br>`frontend/src/contexts/BookingContext.tsx` | Throughout the user session |
| **Validation** | Validates user input and business logic | `frontend/src/components/booking/BookingWizard.tsx`<br>`backend/app/schemas/` | At every form step and backend endpoint |
| **Calendar Sync** | Imports Google Calendar events and merges them into `read_artist_availability` | `backend/app/api/api_calendar.py`<br>`backend/app/services/calendar_service.py`<br>`frontend/src/app/dashboard/profile/edit/page.tsx` | When artists connect or disconnect Google Calendar |
| **Inbox Guide** | Normalizes system messages for thread previews, emits thread notifications on new requests (flagged), and guides users via lightweight CTAs in the chat | `backend/app/crud/crud_booking_request.py`<br>`backend/app/api/api_booking_request.py`<br>`backend/app/utils/messages.py`<br>`backend/app/utils/notifications.py`<br>`frontend/src/components/booking/MessageThread.tsx` | On booking creation and key booking/chat events |

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
* **Frontend:** Travel and accommodation fees are estimated within booking flows like `frontend/src/components/booking/BookingWizard.tsx` and `frontend/src/components/booking/MessageThread.tsx`; the standalone quote calculator page has been removed.
* **Backend:** `booking_quote.py` exposes helpers used by the quote API. `/api/v1/travel-forecast` lives in `api_weather.py` and fetches forecast data from `wttr.in`.

### 4. Quote Generator

* **Purpose:** Calculates and presents full, itemized quote: performance fee, provider, travel, accommodation, service fees.
* **Frontend:** Quote forms in `MessageThread.tsx` show running totals.
* **Backend:** `api_quote.py` aggregates, formats, and returns structured JSON to frontend.

### 5. Quote Preview Agent

* **Purpose:** Shows an estimated total on the review step so the client knows what to expect.
* **Frontend:** `ReviewStep.tsx` calls the quote API and displays the total before submission.
* **Backend:** Reuses `api_quote.py` endpoints to provide quick totals.

### 6. Review Agent

* **Purpose:** Stores 1–5 star ratings and comments for completed bookings.
* **Frontend:** Artist profile pages show reviews and clients can submit them once a booking is done.
* **Backend:** `api_review.py` enforces who can review and fetches lists per artist or service.

### 7. Payment Agent

* **Purpose:** Collects deposits or full payments when a quote is accepted.
* **Frontend:** Payment form appears after quote approval.
* **Backend:** `api_payment.py` creates and confirms payments (currently a stub).

### 8. Notification Agent

* **Purpose:** Sends transactional emails, booking updates, reminders, and chat alerts.
* **Frontend:** `useNotifications.ts` for popups/toasts, badge updates.
* **Backend:** `api_notification.py` exposes CRUD endpoints while `utils/notifications.py` persists alerts in the `notifications` table and can send SMS via Twilio if credentials are configured. A new `/notifications/read-all` endpoint marks every notification read in one request.
* **Notification types:**
  - `new_message` — someone sent a chat message.
  - `new_booking_request` — a client created a booking request.
  - `booking_status_updated` — the request status changed.
  - `deposit_due` — deposit payment reminder when a booking is accepted.
  - `review_request` — triggered after an event is completed to solicit feedback.
* **UI:** Booking confirmed and deposit due alerts show the artist's avatar so recipients can instantly recognize who the notification is from.

### 9. Chat Agent

* **Purpose:** Delivers real-time or async chat, manages unread notifications, logs chat history.
* **Frontend:** `MessageThread.tsx` and related components handle sending and displaying messages.
* **Backend:** `api_message.py` stores messages and `api_ws.py` pushes updates via WebSocket.
* **Features:** Auto-scroll, mobile-friendly input with an emoji picker, avatars, batched typing indicator, adaptive heartbeats for mobile or background tabs, coalesced presence updates, offline send queue with exponential backoff, and image previews that load only when tapped.
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
* **Frontend:** `MessageThread.tsx` renders system messages as centered gray lines; suppresses details summaries from the visible stream but parses them for the details card.
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

---

## Last Updated

2025-06-20

---

**This doc will help future contributors, new devs, and even yourself quickly grok all “smart” parts of the app.**
If you add new features (like analytics, webhook agents, etc.), just append new rows!
