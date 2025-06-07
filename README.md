````markdown
# Booking App

This repository contains a FastAPI backend and a Next.js frontend.

## Backend

Run the API from the `backend` directory so Python can find the `app` package:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
````

The SQLite database path is automatically resolved to the project root, so you can start the backend from either the repo root or the `backend/` folder without creating duplicate database files.

### Service type enum

`services.service_type` stores enum string values such as `"Live Performance"`. If you run into lookup errors, ensure your SQLAlchemy model uses:

```python
SQLAlchemyEnum(ServiceType, values_callable=lambda e: [v.value for v in e])
```

### CORS configuration

Allowed origins are read from `.env` under `CORS_ORIGINS`. By default it includes:

```env
CORS_ORIGINS=["http://localhost:3000","http://localhost:3002"]
```

You can supply a JSON array or a comma-separated string. To test from another device on your LAN, add its origin, for example:

```env
CORS_ORIGINS=["http://localhost:3000","http://localhost:3002","http://192.168.3.203:3000"]
```

Then start the API on all interfaces:

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Unhandled exceptions are returned as JSON 500 responses, so your configured CORS headers are always included.

---

## Frontend

The frontend lives in `frontend/`. From that directory:

```bash
npm install
npm run dev              # listens on localhost only
npm run dev -- -H 0.0.0.0  # listens on all interfaces
```

By default it calls `http://localhost:8000`. To point elsewhere, create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://192.168.3.203:8000
NEXT_PUBLIC_WS_URL=ws://192.168.3.203:8000
```

---

## Development

### One-time setup

Install **both** Python and Node dependencies:

```bash
./setup.sh
```

This script runs `pip install -r backend/requirements.txt` and `npm install` in `frontend/`.

### Linting

```bash
cd frontend
npm run lint
```

### Testing

```bash
./scripts/test-all.sh
```

This runs `pytest`, `npm test`, and `npm run lint`. You can also run each step manually.

### Build

```bash
cd frontend
npm run build
```

---

## New Features

### Sound Providers & Quick Quotes

* **Endpoints** under `/api/v1/sound-providers` and `/api/v1/quotes/calculate`.
* Frontend pages: `/sound-providers`, `/quote-calculator`.
* Quote API factors travel distance, provider fees, and accommodation.

### Booking Wizard

* Reusable `Stepper` and `useBookingForm` hook.
* “Book Now” buttons on service cards.
* New **Review** step showing cost breakdown and selections.

### Real-time Chat

* WebSocket-powered updates.
* Polished bubbles with timestamps, avatars, image previews.
* Fixed input bar & auto-scroll on mobile.
* Floating “scroll to latest” button on small screens.
* Personalized Video flow: multi-step prompts, typing indicators, progress bar.
* Sticky input demo at `/demo/sticky-input` shows local message appending.

### Notifications

* Persisted via `/api/v1/notifications` & `/api/v1/notifications/message-threads`.
* Bell icon in header; slide-out drawer on mobile.
* Grouped by type, mark-as-read endpoints, and “Mark All as Read”.

### Artist Profile Enhancements

* ARIA roles, clearer empty states, optional subtitle/tagline.
* Shared `Card`, `Tag`, `TextInput` components.
* Open Graph meta tags and fallback avatars.
* Accessibility and animation improvements.
* Dashboard stats now animate on load using **framer-motion**.

### Service Management (Artist Dashboard)

* Edit, delete, and reorder services by long‑pressing the handle in the top-right corner and dragging the card. Text selection is disabled for smoother reordering.
* Service deletion now requires confirmation to prevent mistakes.
* **Add Service** button now appears after your services list on mobile (still below stats on larger screens) linking to `/services/new`.
* "Total Services" card now links to `/services?artist=<your_id>` so you only see your listings.
* Mobile-friendly dashboard cards for bookings and requests with larger service action buttons.
* Booking request and booking lists collapse after five items with a **Show All** toggle.
* Improved dashboard stats layout with monthly earnings card.

### Artist Availability

* `GET /api/v1/artist-profiles/{artist_id}/availability` returns `unavailable_dates`.
* Sidebar badges show up to five next available dates.

### Service Types

* New **service\_type** field:
  `"Live Performance"`, `"Virtual Appearance"`, `"Personalized Video"`, `"Custom Song"`, `"Other"`.
* Non–Live/Virtual services go directly to chat instead of the wizard.
* Personalized Video flow handled via `PersonalizedVideoFlow` wrapper and automated questions.

### Reviews

* `POST /api/v1/bookings/{booking_id}/reviews`
* `GET /api/v1/reviews/{booking_id}`
* `GET /api/v1/artist-profiles/{artist_id}/reviews`
* `GET /api/v1/services/{service_id}/reviews`

### Redis Caching

* Caches `/api/v1/artist-profiles/` GET responses.
* Default Redis URL: `redis://localhost:6379/0`.
* Fallback to DB if Redis is unavailable.

### Mobile Navigation & Inbox

* Persistent bottom nav on small screens (visible only when logged in) with compact 56px height so content isn’t hidden.
* Unread message counts badge on Messages icon. Badge now sits snugly over the icon on all devices.
* Tap feedback on icons via `active:bg-gray-100`.
* **Inbox** page at `/inbox` separates Booking Requests and Chats into tabs.
* `ChatThreadView` component for mobile-friendly chat threads.
* Tap a booking request card to open `/bookings/[id]`.
* Unread booking requests are highlighted in indigo so they stand out.
* Cards no longer display a "1 new message" label to keep the list concise.

### Auth & Registration

* Password strength meter and success toast.
* Shared form components with optional Google/GitHub sign-in.

---

## API Endpoints

### Sound Providers

```
GET    /api/v1/sound-providers/
POST   /api/v1/sound-providers/
PUT    /api/v1/sound-providers/{id}
DELETE /api/v1/sound-providers/{id}
GET    /api/v1/sound-providers/artist/{artist_id}
POST   /api/v1/sound-providers/artist/{artist_id}
```

### Booking Requests

```
POST /api/v1/booking-requests/
  Required: artist_id (int)
  Optional: service_id, message, proposed_datetime_1, proposed_datetime_2
```

422 responses indicate schema mismatches—ensure numeric fields are numbers and datetimes are valid ISO-8601 strings. Omit empty strings entirely.

### Reviews

```
POST /api/v1/bookings/{booking_id}/reviews
GET  /api/v1/reviews/{booking_id}
GET  /api/v1/artist-profiles/{artist_id}/reviews
GET  /api/v1/services/{service_id}/reviews
```

### Artist Availability

```
GET /api/v1/artist-profiles/{artist_id}/availability
```

---

## Troubleshooting & Common Errors

* **jest: not found**: Run `npm test` in `frontend/` (auto-installs via `pretest`).
* **Missing package.json**: Ensure you’re in `frontend/` before running `npm test` or `npm run lint`.
* **next: not found / ENOTEMPTY**: Reinstall in `frontend/` with `npm install` or `./setup.sh`.
* **Module not found: Can't resolve 'framer-motion'**: Run `npm install` in `frontend/` to pull the latest dependencies.

---

## Local Test Instructions

1. **Backend tests** (repo root):

   ```bash
   pytest
   ```

2. **Frontend lint**:

   ```bash
   cd frontend
   npm install
   npx eslint src
   ```

```
```

### Brand Colors

The frontend uses a small **brand** palette defined in `tailwind.config.js`. The
primary hue is purple (`#7c3aed`), with `brand-dark` and `brand-light` variants.
Components reference these via utility classes such as `bg-brand` and
`bg-brand-dark`.
