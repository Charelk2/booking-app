# AGENTS.md

This file documents the key automation, agent modules, and service components in the Bookamuso booking-app project.

---

## Agents Overview

| Agent Name                       | Description                                                               | Code Location                                                                       | How it Works / When Triggered                  |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Booking Request Agent**        | Handles booking wizard data, booking flow logic, and business rules         | backend/app/api/api_booking_request.py, frontend/components/booking/BookingWizard.tsx       | When user submits or updates a booking request |
| **Provider Matching Agent**      | Matches user with artist’s preferred sound/accommodation providers        | backend/app/crud/crud_service.py, backend/app/api/api_service.py                  | Invoked during booking and quote steps         |
| **Travel & Accommodation Agent** | Calculates travel needs, handles accommodation logic and user prompts     | backend/app/api/api_booking_request.py, frontend/components/AccommodationStep.tsx | Called if event is outside radius/needs travel |
| **Quote Generator**              | Gathers performance, provider, travel, and accommodation costs for client | backend/app/api/api_quote.py, frontend/components/QuoteSummary.tsx                 | Runs after all booking info is entered         |
| **Quote Preview Agent**          | Shows estimated total during final booking step | frontend/components/booking/steps/ReviewStep.tsx | On review step before submitting request |
| **Payment Agent**                | Manages payment workflows, booking status update, confirmation            | backend/app/api/api_payment.py (planned), frontend/components/PaymentForm.tsx      | On payment page/booking confirmation           |
| **Notification Agent**           | Sends emails, chat alerts, and booking status updates                     | backend/app/api/api_notification.py, backend/app/utils/notifications.py, frontend/hooks/useNotifications.ts | Triggered on status changes, messages, actions |
| **Chat Agent**                   | Manages client-artist/support chat, delivers new message notifications    | backend/app/api/api_chat.py, frontend/components/Chat.tsx                          | Always-on for active bookings                  |
| **Availability Agent**           | Handles real-time artist/service availability checks                      | backend/app/api/v1/api_artist.py, frontend/components/booking/BookingWizard.tsx                | On date/service selection, booking start       |
| **Form State Agent**             | Maintains progress, handles multi-step UX, restores unfinished bookings   | frontend/components/booking/BookingWizard.tsx, frontend/contexts/BookingContext.tsx         | Throughout user session                        |
| **Validation Agent**             | Validates all user input (dates, contact info, logic rules)               | frontend/components/booking/BookingWizard.tsx, backend/app/schemas/                           | At every form step and backend endpoint        |

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

* **Purpose:** Calculates if accommodation is required (based on event vs. artist base), asks client for details, or finds/quotes local options.
* **Frontend:** Prompts client if outside base radius or group travel required, shows options.
* **Backend:** Computes distances, recommends hotels, aggregates total costs for group bookings.

### 4. Quote Generator

* **Purpose:** Calculates and presents full, itemized quote: performance fee, provider, travel, accommodation, service fees.
* **Frontend:** `QuoteSummary.tsx` displays breakdown and live updates as selections change.
* **Backend:** `api_quote.py` aggregates, formats, and returns structured JSON to frontend.

### 5. Quote Preview Agent

* **Purpose:** Shows an estimated total on the review step so the client knows what to expect.
* **Frontend:** `ReviewStep.tsx` calls the quote API and displays the total before submission.
* **Backend:** Reuses `api_quote.py` endpoints to provide quick totals.

### 6. Payment Agent

* **Purpose:** Handles payment workflow—collects payment, updates status, triggers contract/invoice.
* **Frontend:** `PaymentForm.tsx` (or equivalent page/component) takes payment and handles callbacks.
* **Backend:** `api_payment.py` (if implemented) processes payment, updates booking.

### 7. Notification Agent

* **Purpose:** Sends transactional emails, booking updates, reminders, and chat alerts.
* **Frontend:** `useNotifications.ts` for popups/toasts, badge updates.
* **Backend:** `api_notification.py` exposes CRUD endpoints while `utils/notifications.py` persists alerts in the `notifications` table.

### 8. Chat Agent

* **Purpose:** Delivers real-time or async chat, manages unread notifications, logs chat history.
* **Frontend:** `Chat.tsx` for UI, message sending, badge.
* **Backend:** `api_chat.py` for storing/sending messages and push notifications.
* **Features:** Auto-scrolls on new messages, mobile-friendly input bar, avatars, image previews, and a progress bar with typing indicator for Q&A flows.

### 9. Availability Agent

* **Purpose:** Checks/updates in real time which artists and providers are available for a user’s event date and needs.
* **Frontend:** When client picks date/artist, disables blocked dates, shows live availability.
* **Backend:** `api_artist.py` logic for checking calendars, marking bookings.

### 10. Form State Agent

* **Purpose:** Manages progress through multi-step booking, “save for later,” restores session on reload or login.
* **Frontend:** Uses React context/state in `booking/BookingWizard.tsx` and `contexts/BookingContext.tsx`.

### 11. Validation Agent

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

2025-06-06

---

**This doc will help future contributors, new devs, and even yourself quickly grok all “smart” parts of the app.**
If you add new features (like analytics, webhook agents, etc.), just append new rows!
