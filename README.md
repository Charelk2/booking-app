# Booking App

This repository contains a FastAPI backend and a Next.js frontend.

## Backend

Run the API from the `backend` directory so Python can find the `app` package:

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Install dependencies using `pip install -r requirements.txt` first if needed.

The SQLite database path is automatically resolved to the project root so you
can start the backend from either the repository root or the `backend/` folder
without creating duplicate database files.

### Service type enum

`services.service_type` stores the enum's string values such as "Live Performance".
If you see lookup errors when reading services, check that the `Service` model
uses `SQLAlchemyEnum(ServiceType, values_callable=lambda e: [v.value for v in e])`.

### CORS configuration

The backend reads allowed origins from the `.env` file. By default it
includes both `http://localhost:3000` and `http://localhost:3002`.
The value can be provided as a JSON array or a comma separated string.
If your frontend runs on another origin, update the `CORS_ORIGINS` entry
in `.env`.
To access the API from another device on the same Wi‑Fi network add that
origin as well, for example:

```
CORS_ORIGINS=["http://localhost:3000", "http://localhost:3002", "http://192.168.3.203:3000"]
```
When loading the site on a phone or other device, use your computer's IP
address for both the frontend and backend URLs. Add the address to
`CORS_ORIGINS` and reference it from the frontend's `.env.local` as shown
below so the API requests are allowed across origins.
Start the backend so it listens on all interfaces:

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Unhandled exceptions are wrapped in a middleware that returns JSON
`500` responses so the configured CORS headers are always included.

## Frontend

The frontend is in `frontend/`. After installing dependencies with `npm install`, start it with:

```bash
npm run dev
```

When testing on another device, run the dev server so it listens on all
network interfaces:

```bash
npm run dev -- -H 0.0.0.0
```

The frontend expects the backend to be running on `http://localhost:8000`.
If the backend or WebSocket server runs elsewhere, set `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_WS_URL` in `.env.local` accordingly. When accessing the app from
another device, create `frontend/.env.local` with your computer's IP address:

```bash
NEXT_PUBLIC_API_URL=http://192.168.3.203:8000
NEXT_PUBLIC_WS_URL=ws://192.168.3.203:8000
```
## Development

### Setup
Install all Node and Python requirements using the helper script:
```bash
./setup.sh
```
This installs `frontend/node_modules` along with the packages from
`backend/requirements.txt` and `requirements-dev.txt` so both the API and tests
run correctly.

### Linting
Run ESLint after installing dependencies:
```bash
./setup.sh   # run once
cd frontend
npm run lint
```

### Testing
Use the helper script to install dependencies and run all tests in one step:
```bash
./scripts/test-all.sh
```
The script runs `pytest`, frontend Jest tests and ESLint. You can still run them
individually if needed:
```bash
pytest
cd frontend
npm test
npm run lint
```

### Build
```bash
cd frontend
npm run build
```


## New Features

vqiaju-codex/implement-frontend-features
This version introduces basic management of sound providers and an API for quick quote calculations that factor in travel distance, optional provider fees, and accommodation costs. Routers are mounted under `/api/v1/sound-providers` and `/api/v1/quotes/calculate`. The frontend now includes pages at `/sound-providers` and `/quote-calculator` for managing providers and testing quote calculations. The "Request to Book" form on each artist profile now lets clients pick a preferred sound provider, enter travel distance, and see an estimated total before submitting a request.

The booking wizard also features a new **Review** step. This shows a preview of the calculated quote and summarizes all entered details with an improved progress indicator and clearer submit buttons.

### Shared stepper and form hook

The wizard now uses a reusable `Stepper` component along with a `useBookingForm` hook to manage form state. These utilities live under `src/components/ui` and `src/hooks` and can be reused by other multi-step forms.

Each service on an artist profile now includes a "Book Now" button. This opens the booking wizard (or request chat) for that specific service via `/booking?artist_id={id}&service_id={serviceId}` when applicable.
After submitting a booking request, clients are redirected straight to the associated chat thread so they can continue the conversation. The chat interface uses polished message bubbles and aligns your own messages on the right, similar to Airbnb's inbox. The automatic "Requesting ..." and "Booking request sent" entries that previously appeared at the top of each conversation have been removed so the thread begins with meaningful details.

The chat now auto-scrolls after each message, shows image previews before sending, and keeps the input bar fixed above the keyboard on mobile. A subtle timestamp appears inside each bubble, avatars display initials, and the Personalized Video flow shows a progress bar like "1/3 questions answered" with a typing indicator when waiting for the client. Once all questions are answered the progress bar disappears automatically.
- Chat updates are now delivered over a WebSocket connection for real-time conversations without polling.
- The Personalized Video progress bar now disappears once all questions are answered.
The latest update refines the chat bubbles even further: each message now shows its send time inside the bubble. The timestamp sits beneath the text in a tiny gray font and the input field still highlights when focused for better accessibility.
- When artists are logged in, their own messages now appear in blue bubbles just like the client view, while the other person's messages show in gray.
The backend now persists notifications when a new booking request or message is created. Clients and artists can fetch unread notifications from `/api/v1/notifications` and mark them read with `/api/v1/notifications/{id}/read`. Notifications may also be fetched in pages using the `skip` and `limit` query parameters or grouped by type via `/api/v1/notifications/grouped`.
All notifications for the current user can be marked read at once via `/api/v1/notifications/read-all`.
Message alerts are additionally summarized per chat thread using `/api/v1/notifications/message-threads`. This endpoint returns the other user's name, the number of unread messages, the latest snippet, and a link to the conversation. Threads are returned even once read&mdash;`unread_count` simply becomes `0`. Threads can be marked read via `/api/v1/notifications/message-threads/{booking_request_id}/read`.
Booking status changes now trigger a `booking_status_updated` notification so both parties know when a request is withdrawn or declined.
The frontend now shows a notification bell in the top navigation. Clicking it reveals recent alerts, loads more on demand, and automatically marks them as read.
Each notification links directly to the related booking request so you can jump straight into the conversation.
Unread message alerts are grouped by conversation so you may see entries like `Charel Kleinhans — 4 new messages`. Selecting one marks the entire thread read and opens the chat.
The chat thread now displays a friendly placeholder when no messages are present and formats quote prices with the appropriate currency symbol. Any errors fetching or sending messages appear below the input field so problems can be spotted quickly.

- The message input bar has been redesigned for mobile: the file upload button now uses a compact icon and the text field shares the outer border so there are no double lines. Attachments stay inside the chatbox without overlapping other elements.
- The chat box now stretches to roughly 70% of the viewport height on mobile and the Send button uses standard spacing so it's easier to tap.
- A floating "scroll to latest" button appears on mobile when you scroll up so you can quickly jump back to the newest message.

### Artist profile polish (2025-06)
- Added ARIA roles and clearer empty states for better accessibility.
- Service cards collapse on mobile with larger tap areas.
- Explore Other Artists offers grid/list toggles and shows specialties.
- Notification dropdown now displays icons and timestamps.
- Buttons and modals include subtle scale animations.
- Artist profiles now support an optional subtitle/tagline displayed beneath the main name.
- Introduced shared `Card`, `Tag`, and `TextInput` components with built-in loading states and accessibility helpers.
- Profile pages now generate Open Graph meta tags for easier sharing and show a fallback avatar image with an edit overlay for artists.
- Notifications are grouped by type in a dropdown with options to mark each as read or preview the related item.
- The notification dropdown has been replaced with a slide-out drawer that offers more room and a single click to mark all notifications read.
- The notification bell now appears on mobile screens so alerts can be accessed anywhere.
- On small screens, notifications open in a full-screen modal built with `@headlessui/react`'s `Dialog` for easier reading.
- Notification rows now have larger padding and text sizes so they're easier to tap on mobile screens.
- Each notification row is a single button with a fixed avatar circle, making the entire row clickable and accessible.
- Message threads and grouped notifications now keep their headers visible while scrolling on mobile.
- The booking wizard now shows a compact progress bar on small screens so steps remain readable.
- A sticky action bar keeps Back/Next buttons visible on small screens so users can easily navigate each step.
- Steps now automatically scroll to the top when moving between steps on mobile, keeping the next form field in view.
- An inline Next button now appears after selecting a date on mobile so users can quickly continue to the next step.
- The location step now shows a mobile-only Confirm Location button so stage two is easy to advance.
- Guests, venue, notes and review steps now also include inline buttons on mobile so progress is consistent through step six.
- Each step now displays a clear heading and automatically focuses the first field for faster entry.
- Duplicate notifications are now removed when loading additional pages.
- Notification merging now uses a shared utility function so the code stays DRY.
- The Load More button now disappears once all notifications have been fetched.
- Mobile detection for the notification bell now uses a responsive hook so the
  full-screen modal displays reliably on small screens.
- The dark overlay is hidden on small screens so notification links remain clickable.
- Notification rows now support swipe left to mark them read thanks to `react-swipeable-list`.
- The mobile notification modal now shows cards with a "Mark All as Read" button for quicker cleanup.
- Artist profile sections now load independently for faster page rendering and show loading states per section.
- Cover and profile images use Next.js `<Image>` for responsive sizing and better performance.
- Service cards refresh their data when expanded so pricing stays accurate.
- Fixed a crash in the notification dropdown caused by calling hooks before they were initialized.
- Fixed an infinite notifications fetch loop that caused excessive API requests.
- Mobile navigation now slides in from the left with a smooth animation.
- A persistent bottom navigation bar on small screens provides quick access to key pages. Unread message counts now appear over the Messages icon so conversations are never missed.
- Each bottom navigation icon now sits inside a larger 64x44 container for easier taps on mobile.
- Dashboard stat cards are now tappable and link directly to their respective pages.
- A dedicated **Inbox** page lists all message threads and is accessible from the bottom navigation so opening conversations never results in a 404.
- Unread messages within a thread now highlight the sender's name in **bold** and tint the background purple so new chat activity is easier to spot.

### Inbox Page

Open `/inbox` from the Messages icon in the mobile bottom navigation to see all your conversations. Each row shows the latest message snippet and a badge with the number of unread messages. Selecting a thread marks it read and opens the conversation at `/messages/thread/{id}`. The inbox now separates **Booking Requests** and **Chats** into tabs for quicker access.

The registration page now includes a password strength meter and shows a toast notification once an account is created successfully.
Both auth pages use new shared form components and include optional Google and GitHub sign-in buttons.

### Service Types

Services now include a required **service_type** field with the following options:

- **Live Performance**
- **Virtual Appearance**
- **Personalized Video**
- **Custom Song**
- **Other**

If a client chooses a service that is not a Live Performance or Virtual Appearance, the booking wizard is skipped and they are taken directly to the request chat with the service prefilled.

For **Personalized Video** requests, the chat automatically asks the client a few built‑in questions one at a time (who the video is for, occasion, due date, and any instructions). After all answers are collected the artist is notified in the thread. This flow is handled by the `PersonalizedVideoFlow` wrapper around the message thread which also refreshes the conversation whenever a message is sent.
Automated questions are now sent as messages from the artist (or system) with a short typing indicator shown before each prompt so clients no longer see the questions coming from themselves.

`MessageThread` also exposes an optional `onMessageSent` callback so pages can react whenever a new message or quote is posted (for example to advance the personalized video flow).

When running against an existing SQLite database created before this field
existed, the backend will automatically add the `service_type` column at
startup so older installations continue to work without manual migrations.

Likewise, services now use a `display_order` integer to control sorting in the
dashboard. If your database was created prior to this addition the column will
be added automatically when the backend starts.

Notifications also store a `link` field used by the UI. Older SQLite databases
are patched on startup to add this column if it's missing.

### Service Management

From the artist dashboard you can now edit, delete, and rearrange your offered
services. Use the up/down arrows next to a service to change its display order.
- A prominent **Add Service** button appears below your dashboard stats and links directly to `/services/new`.

Deleting a service now cascades removal to any related booking requests and
their messages. Existing conversations will be cleaned up automatically.

### Artist Availability

You can now query an artist's unavailable dates via:

```
GET /api/v1/artist-profiles/{artist_id}/availability
```

which returns a list of `unavailable_dates` to disable in the booking calendar.

The artist profile sidebar now shows up to five upcoming available dates as badges instead of an interactive calendar.

The quote calculation endpoint now returns a full cost breakdown:

```json
{
  "base_fee": 100.0,
  "travel_cost": 20.0,
  "provider_cost": 150.0,
  "accommodation_cost": 50.0,
  "total": 320.0
}
```

## Sound Provider API

The sound provider routes let you manage equipment suppliers and each artist's
preferences. Example requests:

- `GET /api/v1/sound-providers/` – List all providers.
- `POST /api/v1/sound-providers/` – Create a provider by sending JSON like:

  ```json
  {
    "name": "ACME Audio",
    "contact_info": "acme@example.com",
    "price_per_event": 150.0
  }
  ```

- `PUT /api/v1/sound-providers/{id}` – Update a provider.
- `DELETE /api/v1/sound-providers/{id}` – Remove a provider.
- `GET /api/v1/sound-providers/artist/{artist_id}` – Retrieve an artist's
  preferred providers ordered by priority.
- `POST /api/v1/sound-providers/artist/{artist_id}` – Add a new preference for
  the authenticated artist.

## Booking Request API

### `POST /api/v1/booking-requests/`

Create a new booking request. The request body must include:

- `artist_id` (integer, required) – ID of the artist being requested.

Optional fields can also be provided:

- `service_id` (integer) – ID of the service offered by the artist.
- `message` (string) – A message to the artist.
- `proposed_datetime_1` (ISO 8601 datetime) – First proposed date & optional time.
- `proposed_datetime_2` (ISO 8601 datetime) – Second proposed time.

`artist_id` must be an integer. If you don't want to include an optional field, omit it entirely or send a properly typed value. Avoid sending empty strings as placeholders.

## Troubleshooting 422 errors

If the `POST /api/v1/booking-requests/` endpoint responds with **HTTP 422**, the
payload didn't match the expected schema. Ensure you send JSON similar to:

```json
{
  "artist_id": 1,
  "service_id": 3,
  "message": "I'd like to book you",
  "proposed_datetime_1": "2025-01-15T20:00:00Z"
}
```

All numeric fields must be numbers (not strings) and datetimes must be valid ISO
8601 strings. Omit optional fields rather than sending empty strings. If you only
know the date, you can leave the time portion off `proposed_datetime_1`.

After submitting a booking request, the frontend automatically posts a system
message summarizing the selected date, location, guest count, venue type and
any notes into the request's chat thread. This ensures both the artist and
client can easily review all event details from the conversation view.

## Review API

Clients can rate completed bookings using these endpoints:

- `POST /api/v1/bookings/{booking_id}/reviews` – Submit a review.
- `GET /api/v1/reviews/{booking_id}` – Fetch a single review.
- `GET /api/v1/artist-profiles/{artist_id}/reviews` – List reviews for an artist.
- `GET /api/v1/services/{service_id}/reviews` – List reviews for a service.

Only the client who made the booking can create a review and only after the booking status is `completed`.

## Caching with Redis

The artist list endpoint (`/api/v1/artist-profiles/`) now caches its GET
responses using Redis. By default the backend connects to
`redis://localhost:6379/0`. You can override this by setting the `REDIS_URL`
environment variable.

To enable caching during development, install and start a Redis server:

```bash
sudo apt-get install redis-server
redis-server
```

Cached results expire after about one minute. If Redis is unavailable the
endpoint falls back to querying the database normally.
## Common Errors

- **jest: not found**: Dependencies are missing. `npm test` now automatically installs them via a `pretest` script.
- **Missing package.json**: Run `npm test` or `npm run lint` from the `frontend` directory, not the repo root.
- **next: not found / ENOTEMPTY rename node_modules**: The `next` binary and other packages live in `frontend/node_modules`. Run `./setup.sh` or `npm install` inside `frontend` to reinstall dependencies if they are missing or partially installed.


## Local Test Instructions

Run backend tests from the project root:

```bash
pytest
```

Run linting from the `frontend` directory:

```bash
cd frontend
npm install   # if node_modules are missing
npx eslint src
```
