# AGENTS.md
This file documents the key automation, agent modules, and service components in the Bookamuso booking-app project.

---

## Agents Overview

| Agent Name                       | Description                                                               | Code Location                                                                       | How it Works / When Triggered                  |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Booking Request Agent**        | Handles booking wizard data, booking flow logic, and business rules         | backend/app/api/api_booking_request.py, frontend/src/components/booking/BookingWizard.tsx       | When user submits or updates a booking request |
| **Provider Matching Agent**      | Matches user with artist’s preferred sound/accommodation providers        | backend/app/crud/crud_service.py, backend/app/api/api_service.py                  | Invoked during booking and quote steps         |
| **Travel & Accommodation Agent** | Calculates travel needs and accommodation costs     | backend/app/services/booking_quote.py, frontend/src/app/quote-calculator/page.tsx | Used when estimating travel or lodging expenses |
| **Quote Generator**              | Gathers performance, provider, travel, and accommodation costs for client | backend/app/api/api_quote.py, frontend/src/components/booking/MessageThread.tsx                 | Runs after all booking info is entered         |
| **Quote Preview Agent**          | Shows estimated total during final booking step | frontend/src/components/booking/steps/ReviewStep.tsx | On review step before submitting request |
| **Review Agent**                 | Manages star ratings and comments for completed bookings                  | backend/app/api/api_review.py, frontend/src/app/artists/[id]/page.tsx             | After a booking is marked completed        |
| **Payment Agent** | Planned payment workflows, not yet implemented | N/A | Coming soon |
| **Notification Agent**           | Sends emails, chat alerts, and booking status updates                     | backend/app/api/api_notification.py, backend/app/utils/notifications.py, frontend/hooks/useNotifications.ts | Triggered on status changes, messages, actions |
| **Chat Agent** | Manages client-artist/support chat and WebSocket updates | backend/app/api/api_message.py, backend/app/api/api_ws.py, frontend/src/components/booking/MessageThread.tsx | Always-on for active bookings |
| **Caching Agent** | Caches artist lists using Redis | backend/app/utils/redis_cache.py, backend/app/api/v1/api_artist.py | On artist list requests |
| **Personalized Video Agent** | Manages automated Q&A for custom videos | frontend/src/components/booking/PersonalizedVideoFlow.tsx, frontend/src/lib/videoFlow.ts | When service_type is Personalized Video |
| **Availability Agent**           | Handles real-time artist/service availability checks                      | backend/app/api/v1/api_artist.py, frontend/src/components/booking/BookingWizard.tsx                | On date/service selection, booking start       |
| **Form State Agent**             | Maintains progress, handles multi-step UX, restores unfinished bookings   | frontend/src/components/booking/BookingWizard.tsx, frontend/src/contexts/BookingContext.tsx         | Throughout user session                        |
| **Validation Agent**             | Validates all user input (dates, contact info, logic rules)               | frontend/src/components/booking/BookingWizard.tsx, backend/app/schemas/                           | At every form step and backend endpoint        |

---

## Details

### 1. Booking Request Agent

* **Purpose:** Orchestrates multi-step booking—receives event details, stores booking-in-progress, validates required info.
* **Frontend:** `BookingWizard.tsx` manages state, collects data, sends to backend.
* **Backend:** `api_booking_request.py` parses, validates, persists booking requests, and triggers downstream agents.

### 2. Provider Matching Agent

* **Purpose:** Matches client’s needs to artist’s preferred (and fallback) providers for sound and accommodation.
* **Frontend:** After event/artist selection, prompts with available/recommended providers.
* **Backend:** `crud_service.py` and `api_service.py` fetch, filter, and prioritize provider options.

### 3. Travel & Accommodation Agent

* **Purpose:** Calculates travel distance and optional lodging costs so quotes stay accurate.
* **Frontend:** `quote-calculator/page.tsx` lets artists preview travel and accommodation fees.
* **Backend:** `booking_quote.py` exposes helpers used by the quote API.

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

* **Purpose:** Planned payment workflow (not yet implemented).
* **Frontend:** Placeholder UI coming later.
* **Backend:** Payment API pending.

### 8. Notification Agent

* **Purpose:** Sends transactional emails, booking updates, reminders, and chat alerts.
* **Frontend:** `useNotifications.ts` for popups/toasts, badge updates.
* **Backend:** `api_notification.py` exposes CRUD endpoints while `utils/notifications.py` persists alerts in the `notifications` table. A new `/notifications/read-all` endpoint marks every notification read in one request.

### 9. Chat Agent

* **Purpose:** Delivers real-time or async chat, manages unread notifications, logs chat history.
* **Frontend:** `MessageThread.tsx` and related components handle sending and displaying messages.
* **Backend:** `api_message.py` stores messages and `api_ws.py` pushes updates via WebSocket.
* **Features:** Auto-scroll, mobile-friendly input, avatars, image previews, and typing indicator.
### 10. Caching Agent

* **Purpose:** Cache heavy artist list responses using Redis.
* **Backend:** `redis_cache.py` stores serialized profiles; used in `api_artist.py`.
### 11. Personalized Video Agent

* **Purpose:** Automates question prompts for personalized video requests.
* **Frontend:** `PersonalizedVideoFlow.tsx` orchestrates Q&A using `videoFlow.ts`.


### 12. Availability Agent
* **Purpose:** Checks/updates in real time which artists and providers are available for a user’s event date and needs.
* **Frontend:** When client picks date/artist, disables blocked dates, shows live availability.
* **Backend:** `api_artist.py` logic for checking calendars, marking bookings.

### 13. Form State Agent

* **Purpose:** Manages progress through multi-step booking, “save for later,” restores session on reload or login.
* **Frontend:** Uses React context/state in `booking/BookingWizard.tsx` and `contexts/BookingContext.tsx`.

### 14. Validation Agent

* **Purpose:** Ensures all inputs are correct (dates, emails, phone, logic like “accommodation required if >X km”).
* **Frontend:** Inline validation on form steps, helpful error messages.
* **Backend:** Schema and Pydantic model validation for all POSTs/PATCHes.

---

## How to Add or Modify an Agent

* Place new logic in an appropriate backend API/service or frontend component/hook/context.
* Update this file to keep documentation current for all automation and agent logic.
* Ensure each new agent is integrated with relevant booking, notification, or chat workflows as needed.

---

## Last Updated

2025-06-10

---

**This doc will help future contributors, new devs, and even yourself quickly grok all “smart” parts of the app.**
If you add new features (like analytics, webhook agents, etc.), just append new rows!
