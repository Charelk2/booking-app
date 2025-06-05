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
Unhandled exceptions are wrapped in a middleware that returns JSON
`500` responses so the configured CORS headers are always included.

## Frontend

The frontend is in `frontend/`. After installing dependencies with `npm install`, start it with:

```bash
npm run dev
```

The frontend expects the backend to be running on `http://localhost:8000`.
## Development

### Setup
```bash
cd backend
pip install -r requirements.txt
cd ../frontend
npm install
```

### Linting
```bash
cd frontend
npm run lint
```

### Testing
```bash
pytest
cd frontend
npm test
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

Artist profile pages now link to this wizard via a "Start Booking" button which navigates to `/booking?artist_id={id}`.
After submitting a booking request, clients are redirected straight to the associated chat thread so they can continue the conversation. The chat interface uses polished message bubbles and aligns your own messages on the right, similar to Airbnb's inbox. The automatic "Requesting ..." and "Booking request sent" entries that previously appeared at the top of each conversation have been removed so the thread begins with meaningful details.

The chat now auto-scrolls after each message, shows image previews before sending, and keeps the input bar fixed above the keyboard on mobile. A subtle timestamp appears inside each bubble, avatars display initials, and the Personalized Video flow shows a progress bar like "1/3 questions answered" with a typing indicator when waiting for the client. Once all questions are answered the progress bar disappears automatically.
- The Personalized Video progress bar now disappears once all questions are answered.
The latest update refines the chat bubbles even further: each message now shows its send time inside the bubble. The timestamp sits beneath the text in a tiny gray font and the input field still highlights when focused for better accessibility.
- When artists are logged in, their own messages now appear in blue bubbles just like the client view, while the other person's messages show in gray.
The backend now persists notifications when a new booking request or message is created. Clients and artists can fetch unread notifications from `/api/v1/notifications` and mark them read with `/api/v1/notifications/{id}/read`.
The frontend now shows a notification bell in the top navigation. Clicking it reveals recent alerts and automatically marks them as read.
Each notification links directly to the related booking request so you can jump straight into the conversation.
The chat thread now displays a friendly placeholder when no messages are present and formats quote prices with the appropriate currency symbol. Any errors fetching or sending messages appear below the input field so problems can be spotted quickly.

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

### Service Management

From the artist dashboard you can now edit, delete, and rearrange your offered
services. Use the up/down arrows next to a service to change its display order.

### Artist Availability

You can now query an artist's unavailable dates via:

```
GET /api/v1/artist-profiles/{artist_id}/availability
```

which returns a list of `unavailable_dates` to disable in the booking calendar.

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

## Local Test Instructions

Run backend tests from the project root:

```bash
pytest
```

Run linting from the `frontend` directory. Install dependencies with `npm install` first if needed:

```bash
cd frontend
npm install   # if node_modules are missing
npx eslint src
```
