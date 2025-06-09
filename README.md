````markdown
# Booking App

This repository contains a FastAPI backend and a Next.js frontend.

For a map of all booking agents, see [AGENTS.md](AGENTS.md).


## Docker Setup

Build the image and run the development servers inside a container:

```bash
docker build -t booking-app:latest .
docker run --rm -p 3000:3000 -p 8000:8000 booking-app:latest
```

The container installs all Python and Node dependencies. Playwright browsers are
downloaded during the image build so tests can run offline. Use a volume mount
to iterate locally:

```bash
docker run --rm -v "$(pwd)":/app -p 3000:3000 -p 8000:8000 booking-app:latest
```

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

See [AGENTS.md](AGENTS.md) for a reference to the automation modules that may require updates when adding features.

### One-time setup

Install **both** Python and Node dependencies. The `setup.sh` script can be run
from any directory and automatically installs backend and frontend packages:

```bash
./setup.sh
```

This script installs Python requirements from `backend/requirements.txt` **and**
`requirements-dev.txt`, then runs `npm ci` inside `frontend/` using `pushd`/`popd` so your working directory is restored afterward.

### Linting

```bash
cd frontend
npm run lint
```

### Testing

```bash
./scripts/test-all.sh
```
This script runs `pytest`, executes Jest and Playwright using Node, and finally
`npm run lint`. Running the CLIs directly avoids missing binary errors when
`node_modules/.bin` links are not created. `setup.sh` skips dependency
installation when packages are already present so repeated test runs are much
faster. End-to-end tests in `frontend/e2e` use
[Playwright](https://playwright.dev/) to launch the Next.js development server
and walk through the Booking Wizard.

You can also run the tests inside the Docker image if you prefer not to install
anything locally:

```bash
docker build -t booking-app:latest .
docker run --rm booking-app:latest ./scripts/test-all.sh
```

If your CI environment has no external network access, build the image ahead of
time with connectivity so all dependencies and Playwright browsers are cached.
The Dockerfile explicitly installs browsers during the build by overriding
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, so offline containers have everything
needed. The `setup.sh` script installs browsers only when missing, so repeat runs
are fast even when network access is blocked. You can then run the tests offline:

```bash
docker run --rm --network none booking-app:latest ./scripts/test-all.sh
```

### Offline Testing with Docker

If `setup.sh` fails because dependencies cannot be installed (such as in an
isolated CI environment), build the Docker image once with network access and
reuse it for subsequent test runs. The image caches Python packages, Node
modules, and Playwright browsers so `test-all.sh` can run entirely offline:

```bash
docker build -t booking-app:latest .  # build once with connectivity
docker run --rm --network none booking-app:latest ./scripts/test-all.sh
```
When running tests from this pre-built image, `setup.sh` detects the cached
Python packages, Node modules, and Playwright browsers and therefore skips
any downloads. This allows repeated test executions without network access.

### Build

```bash
cd frontend
npm run build
```

## Docker CI

```bash
# Build once (with network)
docker build -t booking-app:ci .

# Run all tests offline (unit & e2e, Chrome/Firefox/WebKit)
docker run --rm --network none booking-app:ci
```

Logs now include `--- STARTING setup.sh ---` and `--- STARTING test-all.sh ---`.

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
* Success toasts when saving a draft or submitting a request.

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
* Optional SMS alerts when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are set in the backend environment.

### Artist Profile Enhancements

* ARIA roles, clearer empty states, optional subtitle/tagline.
* Shared `Card`, `Tag`, `TextInput` components.
* Open Graph meta tags and fallback avatars.
* Accessibility and animation improvements.
* Dashboard stats now animate on load using **framer-motion**.

### Service Management (Artist Dashboard)

* Edit, delete, and reorder services by long‑pressing the handle in the top-right corner and dragging the card. Text selection is disabled for smoother reordering.
* Drag handle now reliably activates on mobile by disabling default touch actions, capturing the pointer, and persisting the event during the long press until pointer up or cancel.
* Each service card uses its own drag controller so the correct card moves even after reordering. A subtle ring highlight shows which card is active while dragging, and it disappears when the card is dropped.
* A short vibration cues the start of reordering on devices that support it, using a persisted pointer event for reliability.
* The handle blocks the context menu so long presses don't select text, applying `user-select: none` only during drag so you can still highlight service details normally.
* Reordering keeps the first card below the **Your Services** heading by constraining drag movement to the list area.
* Service deletion now requires confirmation to prevent mistakes.
* **Add Service** button now opens a modal to create a new service. It appears after your services list on mobile and below stats on larger screens.
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

* Persistent bottom nav on small screens (visible only when logged in) with compact 56px height.
* Bottom nav auto-hides when you scroll down and reappears when scrolling up.
* Unread message counts badge on Messages icon. Badge now sits snugly over the icon on all devices.
* Tap feedback on icons via `active:bg-gray-100`.
* **Inbox** page at `/inbox` separates Booking Requests and Chats into tabs.
* `ChatThreadView` component for mobile-friendly chat threads.
* Tap a booking request card to open `/booking-requests/[id]`.
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
Validation errors are now logged server-side and returned as structured JSON so you can quickly debug bad requests.

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

### Calendar Export

```
GET /api/v1/bookings/{booking_id}/calendar.ics
```

### Payments

```
POST /api/v1/payments
 Required: booking_request_id, amount
 Optional: full (bool)
```
Payment processing now emits structured logs instead of printing to stdout so transactions can be traced in production.

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

Update these colors in `frontend/tailwind.config.js` and
`frontend/src/app/globals.css` to adjust the site's look and feel. See
`frontend/README.md` for detailed theming instructions.
