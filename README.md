# Booking App

This repository contains a FastAPI backend and a Next.js frontend.

## Backend

Run the API from the `backend` directory so Python can find the `app` package:

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Install dependencies using `pip install -r requirements.txt` first if needed.

### CORS configuration

The backend reads allowed origins from the `.env` file. By default it
includes both `http://localhost:3000` and `http://localhost:3002`. If your
frontend runs on another origin, update the `CORS_ORIGINS` entry in `.env`.

## Frontend

The frontend is in `frontend/`. After installing dependencies with `npm install`, start it with:

```bash
npm run dev
```

The frontend expects the backend to be running on `http://localhost:8000`.

## New Features

vqiaju-codex/implement-frontend-features
This version introduces basic management of sound providers and an API for quick quote calculations that factor in travel distance, optional provider fees, and accommodation costs. Routers are mounted under `/api/v1/sound-providers` and `/api/v1/quotes/calculate`. The frontend now includes pages at `/sound-providers` and `/quote-calculator` for managing providers and testing quote calculations. The "Request to Book" form on each artist profile now lets clients pick a preferred sound provider, enter travel distance, and see an estimated total before submitting a request.

The booking wizard also features a new **Review** step. This shows a preview of the calculated quote and summarizes all entered details with an improved progress indicator and clearer submit buttons.

Artist profile pages now link to this wizard via a "Start Booking" button which navigates to `/booking?artist_id={id}`.


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
    "price_per_event": 150.00
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

Set the `PYTHONPATH` when running backend tests:

```bash
export PYTHONPATH=.
pytest
```

Run linting from the `frontend` directory. Install dependencies with `npm install` first if needed:

```bash
cd frontend
npm install   # if node_modules are missing
npx eslint src
```
