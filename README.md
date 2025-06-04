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

This version introduces basic management of sound providers and an API for quick quote calculations that factor in travel distance, optional provider fees, and accommodation costs.  Routers are mounted under `/api/v1/sound-providers` and `/api/v1/quotes/calculate`.

## Booking Request API

### `POST /api/v1/booking-requests/`

Create a new booking request. The request body must include:

- `artist_id` (integer, required) – ID of the artist being requested.

Optional fields can also be provided:

- `service_id` (integer) – ID of the service offered by the artist.
- `message` (string) – A message to the artist.
- `proposed_datetime_1` (ISO 8601 datetime) – First proposed time.
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
8601 strings. Omit optional fields rather than sending empty strings.
