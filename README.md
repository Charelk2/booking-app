# Booking App

This repository contains a FastAPI backend and a Next.js frontend.

User roles include `service_provider` (formerly `artist`) and `client`. The API
also accepts the legacy `ARTIST` user type and maps it to `service_provider`
for backward compatibility.

On startup the backend now upgrades any legacy `ARTIST` entries in the `users`
table to the current `SERVICE_PROVIDER` role so existing artists can still log
in.

The July 2025 update bumps key dependencies and Docker base images:

- **FastAPI** 0.115.12 (requires Starlette 0.46+)
- **Uvicorn** 0.34
- **React** 18.3 and **Next.js** 14.2
- **Python** 3.12.11
- **Node.js** 22 (v22.16.0)
- Artists with missing names are now hidden from listings to avoid "Unknown Artist" placeholders.
- Artists page adds a **Load More** button that fetches additional results using
  the API's pagination parameters.
- Artists page redesigned with a responsive grid, sticky search header with quick
  filters, skeleton loaders and a hover "Book Now" overlay for a modern,
  accessible look.
 - Price filter now displays a histogram styled like Airbnb and uses the open-source `rheostat` dual-handle slider. Numeric input allows precise ranges and slider thumbs remain clickable even when overlapping.
- Further refined the price slider so both handles stay clickable even when they overlap.
- Consolidated slider styling into Tailwind utilities, removing custom CSS from
  `globals.css` for simpler maintenance.
- Animations now respect the user's `prefers-reduced-motion` setting via a
  global rule in `globals.css`.
- Homepage search now lives in the header on a light gray background.
- Collapsed search bar truncates long locations with an ellipsis so the text never wraps.
- Fixed an initial load bug where a selected date sent an invalid `when` value and caused a 422 error.
- Dashboard now casts `user.id` to a number when fetching services to avoid 422 errors if the ID is stored as a string.
- Search categories now map each service category to its corresponding service type (for example, **Musician / Band** maps to `Live Performance`) so searching by category shows available artists.
- Visiting `/category/dj` (or the legacy `/service-providers/category/dj`) normalizes the category path so listings only show matching services.
- The artist search endpoint now ignores unrecognised `category` values (for example, `category=Musician` or `category=DJ`) and returns all artists instead of a 422 error.
- Category popup now includes an provider name search input for quick navigation to
  individual profiles.

## Observability

Structured JSON logs and OpenTelemetry traces are enabled for both the FastAPI backend and the Next.js frontend. See [docs/observability.md](docs/observability.md) for SLO targets and alerting recommendations.
- Mobile telemetry captures Web Vitals (LCP, INP), tap errors, and rage taps, segmenting events by viewport width and device pixel ratio. Alerts fire when mobile SLOs are exceeded.
- Chat now provides optimistic send with status indicators, long message and provider lists are virtualized for smoother scrolling, and booking form validation/autosave are debounced and throttled for better responsiveness.
- An unobtrusive marketing strip replaces the old Hero section.
- The homepage now highlights popular, top rated, and new artists in horizontally scrollable carousels.
- The "Services Near You" category carousel adds previous/next buttons so desktop users can page through service types.
- Service categories are assigned when adding services; service providers no longer choose a category during onboarding. The `/api/v1/service-categories` endpoint lists the seeded categories.
- Newly registered service providers start with no default category, ensuring they aren't automatically labeled (e.g., as photographers) until they add a service.
- Frontend components now fetch service categories dynamically via the `useServiceCategories` hook rather than relying on a static map.
- The `categorySlug` helper normalizes irregular names (e.g., "DJ's", "Sound Services") to canonical slugs so newly added services route to the correct homepage categories.
 - Seeded categories include Musician, DJ, Photographer, Videographer, Speaker, Sound Service, Wedding Venue, Caterer, Bartender, and MC & Host.
 - Services may optionally include a `service_category_id` and JSON `details` object for category-specific attributes, enabling tailored service data. API responses also expose a `service_category_slug` derived from the category name so clients can avoid relying on database IDs.
 - Artist profile responses now include a `service_categories` array listing all categories the artist offers.
- Artist search results clear their Redis cache whenever services change so new offerings appear immediately in category searches.
- Bookings now track `payment_status`, `deposit_amount`, and `deposit_paid` in
  `bookings_simple`. The deposit amount defaults to half of the accepted quote
  total. Booking API responses now include these fields alongside
  `deposit_due_by`.
- A new `deposit_due_by` field records when the deposit is due, one week after a quote is accepted.
- Payment receipts are stored with a `payment_id` so clients can view them from the dashboard.
- Successful payments now automatically confirm the booking and send a system
  "View Booking Details" message to both client and artist chats.
- All booking and quote status changes now emit INFO logs, and scheduler failures
  trigger error alerts so issues surface in monitoring tools. CTA clicks on the
  frontend fire analytics events for centralized tracking.
  - Chat threads now surface contextual action buttons—**View Booking Details**—with countdown timers
    when quotes expire, so users never miss a deadline.
- Users can download all account data via `/api/v1/users/me/export` and permanently delete their account with `DELETE /api/v1/users/me`.
- Booking cards now show deposit and payment status with a simple progress timeline.
- Booking request detail pages now display a step-by-step timeline from submission to quote acceptance.
- Booking wizard includes a required **Guests** step.
- Date picker shows skeleton loaders while data fetches.
- Travel mode and cost predictions use a regression-based estimator within booking flows.
- Sound provisioning selections now influence quote estimates; driving-only setups automatically fall back to external providers when flying.
- The chat's inline quote composer now auto-prefills service, travel, and sound fees using `/api/v1/quotes/calculate` when sound equipment is required.
- Google Maps and large images load lazily once in view to reduce first paint time.
- Client dashboards now include a bookings list with upcoming and past filters via `/api/v1/bookings/my-bookings?status=`.
- Each booking item in this list now includes a `deposit_due_by` field when the booking was created from a quote. This due date is calculated one week from the moment the quote is accepted.
- Artists can mark bookings completed or cancelled and download confirmed bookings as calendar (.ics) files generated with the `ics` library.
- Clients can leave a star rating and comment once a booking is marked completed. Service detail pages now display these reviews.
- A **Leave Review** button now appears in chat when a completed booking has no review.
- After accepting a quote, clients see quick links in the chat to view that booking, pay the deposit, and add it to a calendar.
- In test environments, accepting a quote instantly triggers supplier outreach, marks the deposit as paid, and provides a mock receipt link for download.
- Inbox conversations feature a **Show Details** button that opens a slide-out booking details panel. On mobile the panel overlays the chat, while on desktop it appears side-by-side with smooth Tailwind transitions.
- The chat thread now expands or contracts horizontally as the side panel is toggled, keeping date divider lines perfectly aligned across both sections.
- Chat WebSocket connections send periodic ping/pong heartbeats that lengthen on mobile and pause when tabs are hidden, batch typing indicators, coalesce presence updates, and close slow clients after a one-second send timeout. A `reconnect_hint` message guides exponential retries and Redis pub/sub is used when `WEBSOCKET_REDIS_URL` is set.
- Artists can upload multiple portfolio images and reorder them via drag-and-drop. Use `POST /api/v1/service-provider-profiles/me/portfolio-images` to upload and `PUT /api/v1/service-provider-profiles/me/portfolio-images` to save the order.
- Artists can also drag and drop service cards on the dashboard to set their display order.
- Heavy tasks like NLP parsing, notification delivery, and weather lookups now run
  on an in-process background worker with retry and dead-letter queues to keep
  API responses fast.
- Adding a service now requires at least one image, and the uploaded media displays on the service provider profile within each service block.
- Dashboard pages are now separated by user type: artists use `frontend/src/app/dashboard/artist/page.tsx` and clients use `frontend/src/app/dashboard/client/page.tsx`.
- Quote modal items can now be removed even when only one item is present.
- Clients can upload and crop a profile picture via `/api/v1/users/me/profile-picture`; chat messages and notifications will show the artist or client avatar when available.
- The client user menu now links to an **Account** page where you can update your profile picture, export data, or delete the account.
- Artist profile picture uploads now update the account avatar so the image persists after logout and page refreshes. When logged in as an artist, the profile picture from **Edit Profile** is shown across the site, including the top navigation menu.
- Booking request cards now show the client's profile picture when available so requests are easier to identify.
- Status badges on booking request cards now use classes like `status-badge-quote-provided` for consistent colors.
- Backend now defines a unified `BookingStatus` enum in `backend/app/models/booking_status.py` shared by bookings and booking requests.
- Error fallback messages now detect authentication failures and prompt users to log in.
- Booking request API responses now include `last_message_content` and `last_message_timestamp` so inbox conversations sort by recent chats.
- Chat message timestamps are stored in GMT+2 to provide consistent send times across regions.
- Messages now include a `message_type` (`USER`, `QUOTE`, `SYSTEM`) and `visible_to`
  (`artist`, `client`, `both`) field so threads render and filter correctly for
  each participant. The API also accepts the legacy values `text`, `quote`, and
  `system` (in any case) and automatically normalizes them to the uppercase
  values above for backward compatibility.
- Legacy `visible_to` values such as `BOTH` are now accepted and normalized to
  lowercase to prevent errors when loading old messages.
- Backend now fetches these fields using a single optimized query for improved performance.
- Booking request endpoints now embed the artist's business name so clients no longer see placeholder `user/unknown` names.

### Inbox & Message API

The chat service exposes REST endpoints for each booking request:

| Method | Route | Description |
| ------ | ----- | ----------- |
| `GET` | `/api/v1/booking-requests/{id}/messages` | List all messages in a thread |
| `PUT` | `/api/v1/booking-requests/{id}/messages/read` | Mark thread messages as read |
| `POST` | `/api/v1/booking-requests/{id}/messages` | Send a new message |
| `POST` | `/api/v1/booking-requests/{id}/attachments` | Upload a file attachment |

If no file is included in the request body, the API responds with status `422`
and a clear error message: `{"message": "No file provided", "field_errors": {"file": "required"}}`.

Example message payload:

```json
{
  "content": "See you at 8pm",
  "message_type": "USER",
  "visible_to": "both"
}
```

Message state transitions:

![Message state diagram](docs/message_state_diagram.svg)

For a map of all booking agents, see [AGENTS.md](AGENTS.md).

### Logging & Monitoring

- SQLAlchemy listeners in [`backend/app/utils/status_logger.py`](backend/app/utils/status_logger.py)
  emit INFO logs whenever a booking, booking request, or quote changes status.
- Background scheduler failures invoke
  [`alert_scheduler_failure`](backend/app/utils/notifications.py) which logs an
  error so alerts surface in monitoring systems.
- The booking wizard records CTA clicks using `trackEvent` for centralized analytics.

### Home Page Carousels

The homepage now showcases musicians in horizontally scrollable carousels. Sections such as **Popular**, **Top Rated**, **New on Booka**, and **Recently Booked** let visitors swipe or drag to browse profiles. Each musician card links to `/service-providers/[id]`.

This discovery feed is experimental and may evolve in future updates.

When there are no profiles to show, the **Popular** and **Top Rated** sections
are hidden. The **New on Booka** section now displays up to 100 of the newest
artists so they are easier to discover.

## Docker Setup

Pull the pre-built image or build it yourself, then run the development
servers inside a container:

```bash
docker pull ghcr.io/example-org/booking-app-ci:latest # optional pre-built image
docker run --rm -p 3000:3000 -p 8000:8000 ghcr.io/example-org/booking-app-ci:latest
```

For first-time test runs with internet access, populate the dependency caches by
running `DOCKER_TEST_NETWORK=bridge ./scripts/docker-test.sh`. This copies the
caches from the Docker image so subsequent runs work offline.

To develop using the pre-built image without reinstalling dependencies, mount the repository and expose the ports:

```bash
docker run --rm -v "$(pwd)":/app -p 3000:3000 -p 8000:8000 ghcr.io/example-org/booking-app-ci:latest
```

If you prefer to build locally instead, run:

```bash
docker build -t booking-app:latest .
docker run --rm -p 3000:3000 -p 8000:8000 booking-app:latest
```
The Dockerfile installs Node.js via the official NodeSource setup script
so that `npm ci` runs reliably during the build. Pull the latest image or
rebuild whenever dependencies change. If you hit network errors during
`npm ci`, rebuild with network access by setting `DOCKER_TEST_NETWORK=bridge`
or running `docker build`/`docker run` with `--network bridge` so npm can
reach the registry.

Even with Docker network access, corporate proxies or partial restrictions may
still block requests to `registry.npmjs.org`. If `npm ci` fails with
`ECONNRESET` or `ENETUNREACH`, configure your proxy and rerun with network
bridge enabled:

```bash
npm config set proxy http://proxy:8080
npm config set https-proxy http://proxy:8080
DOCKER_TEST_NETWORK=bridge ./scripts/docker-test.sh
```

### docker-test.sh quickstart

1. **Populate caches with network access**

   ```bash
   DOCKER_TEST_NETWORK=bridge ./scripts/docker-test.sh
   ```

This pulls (or builds) the testing image and copies `backend/venv` and
`frontend/node_modules` from the container. If only the `*.tar.zst` archives
exist, the script extracts them so the directories are restored. This first
run is mandatory&mdash;`./scripts/test-all.sh` will fail until these caches
are populated.


2. **Run tests offline**

   ```bash
   BOOKING_APP_SKIP_PULL=1 DOCKER_TEST_NETWORK=none ./scripts/docker-test.sh
   ```

  Subsequent runs reuse the cached dependencies and pass `--network none` to
  avoid downloading packages, making the tests start much faster. If you update
  `requirements.txt` or `package-lock.json`, run again with
  `DOCKER_TEST_NETWORK=bridge` so the caches are refreshed. You can delete the
  caches or rebuild the image manually if needed.

The container installs all Python and Node dependencies. During the build
step it creates `backend/venv` and installs the requirements into that
virtual environment. The Python version is saved in `backend/venv/.meta` and the hash of `requirements.txt` is written to `backend/venv/.req_hash`. `setup.sh` checks these files so repeated runs skip `pip install` when nothing changed. Node dependencies live in `frontend/node_modules` with the Node version recorded in `frontend/node_modules/.meta` and a hash stored in `frontend/node_modules/.pkg_hash`. Use a volume mount to iterate locally:

```bash
docker run --rm -v "$(pwd)":/app -p 3000:3000 -p 8000:8000 booking-app:latest
```

## Backend

Run the API from the `backend` directory so Python can find the `app` package:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

If you encounter `ModuleNotFoundError: No module named 'pyotp'`, the Python
dependencies were not installed correctly. Run the `pip install` command above
or execute `./setup.sh` from the project root to install both backend and
frontend packages.

The SQLite database path is automatically resolved to the project root, so you can start the backend from either the repo root or the `backend/` folder without creating duplicate database files.

`uvicorn` loads environment variables from `backend/.env` because the `Settings` class uses that file by default. Copy `.env.example` to both `.env` and `backend/.env` so the API and tests share the same configuration, or set `ENV_FILE` to point to another path if needed. Missing SMTP fields cause the application to exit on startup so the email confirmation feature cannot be misconfigured.

`backend/main.py` also calls `load_dotenv()` so these variables are available when running the script directly. This ensures features such as the travel distance API work with your configured credentials.

Responses now use `orjson` for faster serialization and omit `null` fields by default. You can adjust server concurrency and keep-alive behavior by setting `UVICORN_WORKERS` and `UVICORN_KEEPALIVE` before launching Uvicorn.

### Travel estimator

The `/api/v1/quotes/calculate` endpoint now uses a regression-based travel estimator. Pass `distance_km` in the request body and the response will include a `travel_estimates` array of `{mode, cost}` pairs along with the chosen `travel_mode` used for totals.

### Database migrations

After pulling schema changes, run `alembic upgrade head` to apply the new migrations. The API will attempt to add missing columns such as `artist_profiles.price_visible`, `services.currency`, `bookings_simple.date`/`location`, `bookings_simple.payment_status`, `users.mfa_secret`/`mfa_enabled`, `calendar_accounts.email`, `messages.is_read` (added in revision `1e5c92e1a7de`), `messages.action` (added in revision `e0069045b94f`), and `booking_requests.travel_mode`/`travel_cost`/`travel_breakdown` automatically for SQLite setups. Non-SQLite deployments should run the new Alembic migration after pulling this update. Simply starting the API will also add the new `calendar_accounts.email` column if it is missing.

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

When the server starts it logs the resolved origins, e.g. `CORS origins set to: ['http://localhost:3000']`, so you can verify your configuration.

For quick local testing you can bypass specific origins entirely by setting `CORS_ALLOW_ALL=true` in `.env`. When enabled the API responds with `Access-Control-Allow-Origin: *`.

Unhandled exceptions are returned as JSON 500 responses. The middleware now injects the appropriate `Access-Control-Allow-Origin` header even when errors occur, so browser clients never see a CORS failure when the API throws an exception. HTTP errors raised with `HTTPException` keep their original status codes and messages instead of always becoming 500 errors.

### OpenAPI schema

Generate the latest API specification with:

```bash
npm run make-openapi
```

This command writes `docs/openapi.json`. If the server is running you can also download the file directly:

```bash
curl http://localhost:8000/openapi.json -o docs/openapi.json
```

### Quote expiry scheduler

`backend/main.py` launches a background task that runs every hour. It sends a
reminder 24 hours before a quote's `expires_at` timestamp and marks pending
quotes as expired once that time passes. When a quote expires, a `SYSTEM`
message reading **Quote expired.** is added to the related chat thread.
The helper functions `notify_quote_expiring` and `notify_quote_expired` alert
both the artist and client when these events occur. If you deploy multiple
workers, ensure only one instance runs the scheduler or replace it with a
system cron job that calls `expire_pending_quotes()`.

### Google Calendar OAuth

Set these variables in your `.env` file (in the repo root) to enable syncing with Google Calendar:

```env
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/google-calendar/callback
FRONTEND_URL=http://localhost:3000
```
Your OAuth consent screen should also request the scopes
`https://www.googleapis.com/auth/calendar.readonly`,
`https://www.googleapis.com/auth/userinfo.email`,
`https://www.googleapis.com/auth/userinfo.profile`, and `openid`.

Use `GET /api/v1/google-calendar/connect` to begin OAuth. After the Google
callback completes, the API redirects to
`FRONTEND_URL/dashboard/profile/edit?calendarSync=success` on success or
`calendarSync=error` when the exchange fails. Artists can disconnect via
`DELETE /api/v1/google-calendar` or check the connection status with
`GET /api/v1/google-calendar/status` which now also returns the connected
email address when available.
The authorization URL now includes `prompt=consent` so Google always returns a
refresh token. If the callback does not receive one, the API responds with HTTP
400 and logs the error instead of failing a database insert.
If a stored refresh token becomes invalid (e.g. revoked), the calendar sync
logic now removes the credentials and returns an empty availability list rather
than failing with a 500 error. Artists will need to reconnect their Google
Calendar account.
If the API starts without `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` set, calendar syncing is disabled and a warning is logged. Calls to the OAuth endpoints now return HTTP 500 instead of redirecting to a Google error page when these credentials are missing.

After installing new dependencies, run `./scripts/test-all.sh` once to refresh the caches.

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
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyDm-BKmMtzMSMd-XUdfapjEUU6O5mYy2bk
NEXT_PUBLIC_GOOGLE_MAPS_KEY=<your-distance-matrix-key>
```

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` should be a browser key with the Places API
enabled. It powers the `LocationInput` autocomplete fields used in the artist
filters, search bar, and booking steps.

`NEXT_PUBLIC_GOOGLE_MAPS_KEY` is still required for geocoding but the frontend
no longer contacts Google directly for distance calculations. Instead it calls
`/api/v1/distance`, and the backend forwards the request using your server key.

Set `GOOGLE_MAPS_API_KEY` in your `.env` so this proxy works. The key is never
exposed to the browser.

If you source the same `.env` file for the backend, the API configuration now
includes `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` as an optional setting. The backend
does not use this key, but declaring it prevents a Pydantic validation error
when extra environment variables are forbidden.

`FLIGHT_API_KEY` configures the flight lookup service used by
`/api/v1/flights/cheapest`. Sign up for a free token from TravelPayouts or a
similar provider and add it to your `.env` file.

The host portion of `NEXT_PUBLIC_API_URL` is also used by
`next.config.js` to allow optimized image requests from the backend.
Set this URL to match your API server so service provider profile pictures and
cover photos load without 400 errors from the `/_next/image` endpoint.
The `next.config.js` file now explicitly includes `/static/cover_photos/**` and
`/static/portfolio_images/**` alongside `/static/profile_pics/**` in its
`remotePatterns` list.

The location input now reuses the `LocationInput` component which directly
invokes the Google Places API via the shared `loadPlaces()` helper. This keeps
styling and behaviour consistent with the homepage and artist page search bars
while ensuring the Maps script is injected only once, avoiding the
"API included multiple times" warning. When the API key is missing the field
degrades to a plain text input instead of throwing a runtime error.
If a user begins typing before the script finishes loading, their query is now
retried automatically once the API becomes available so suggestions appear
without requiring additional input.

The **Edit Profile** page now uses this same component and requires a location
to be entered so travel fees can be estimated correctly.

The previous built-in autocomplete is deprecated. The location picker still
opens a minimalist modal when the **Map** button is clicked. The modal contains
just the search field and closes via a soft "Close" button. Closing the modal
blurs the original input so it doesn't instantly reopen when refocused.

To expose the app on your local network, replace `192.168.3.203` with your
machine's LAN IP. Set the same address in `.env` under
`CORS_ORIGINS=["http://<your-ip>:3000"]`, then start the backend with
`--host 0.0.0.0` and run `npm run dev -- -H 0.0.0.0` so both servers listen on
all interfaces.

The frontend automatically attaches an `Authorization` header when a token
exists in the browser's `localStorage` or `sessionStorage`. The request
interceptor now verifies `typeof window !== 'undefined'` before accessing these
APIs, so server-side rendering and tests that lack a `window` object no longer
fail.
`useIsMobile` also initializes to `false` and updates on mount so mobile devices
avoid hydration errors when rendering responsive components.

Protected pages redirect unauthenticated visitors to `/login?next=<path>`. After
sign in or sign up, the app automatically returns to the original URL. If a
session already exists when visiting the login page, it immediately forwards to
the target location. The dashboard now waits for the authentication state to
load before performing this redirect, preventing a loop after social login.

API responses are now handled by a global interceptor which maps common HTTP
status codes to human-friendly error messages and logs server errors to the
console. Hooks and components no longer need to parse Axios errors manually.

### Google & GitHub OAuth login

Set these variables in `.env` to enable social sign-in:

```env
GOOGLE_OAUTH_CLIENT_ID=<your-google-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<your-google-client-secret>
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>
```

The backend registers Google OAuth with
`api_base_url` set to `https://openidconnect.googleapis.com/v1/`, ensuring the
`userinfo` endpoint resolves correctly when exchanging the access token.

OAuth routes store the provider state in a session cookie signed with
`SECRET_KEY`. Ensure the same key is set in `.env` and `backend/.env`
so logins work across environments.

To connect an account:

1. Copy `.env.example` to both `.env` and `backend/.env`, add the above credentials, then start the server (or set `ENV_FILE` to your chosen path). This prevents `Google OAuth not configured` errors.
2. Visit `/auth/google/login` or `/auth/github/login` to begin authentication.
   If no `?next=` parameter is supplied the user is redirected to `/dashboard`
   once the login succeeds. Pages may append `?next=/some/path` (for example a
   booking page) so users return to their original destination after
   authentication.
3. Approve the permissions requested by the provider.
4. The API creates or updates the user, marks them verified, issues a JWT, and
   redirects to `/login?token=<jwt>&next=<path>` where `<path>` is the original
   destination. The login page saves the token then forwards to that path.
   If an account with the same email already exists, Google sign-in now logs
   into that account instead of creating a duplicate.
5. Token exchange or profile retrieval failures now log the underlying error and
   return `400` responses like `Google authentication failed` to aid debugging.

### SMTP email settings

Outgoing mail uses these variables:

```env
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=no-reply@localhost
```

If `SMTP_USERNAME` and `SMTP_PASSWORD` are provided, TLS is automatically used
when sending email.

These values correspond to `Settings.SMTP_HOST`, `Settings.SMTP_PORT`,
`Settings.SMTP_USERNAME`, `Settings.SMTP_PASSWORD`, and `Settings.SMTP_FROM`
defined in `backend/app/core/config.py`. They are required for the email
confirmation feature—missing values will cause the backend to exit during
startup.

### Payment gateway configuration

Specify your payment provider base URL in `.env`:

```env
PAYMENT_GATEWAY_URL=https://pay.example.com
```

The default `https://example.com` is a placeholder. The API logs a warning on startup if this value isn't changed.

### Email confirmation

Users registering via `/auth/register` receive a short-lived token in an email
pointing to `/confirm-email?token=<token>`. Submitting this token through the
new `POST /auth/confirm-email` endpoint marks the user as verified and removes
the token from the `email_tokens` table. Service providers are currently
auto-verified on registration, so they can sign in without confirming their
email and are automatically signed in upon successful registration.
All email addresses are normalized to lowercase during registration and login so
`User@Example.com` and `user@example.com` refer to the same account.
Gmail addresses are further canonicalized: dots and `+tags` are ignored and
`googlemail.com` maps to `gmail.com`. This prevents duplicate users when signing
in with Google OAuth.

Steps to confirm an email address:

1. Register an account using `POST /auth/register`.
2. Click the link in the email or send `POST /auth/confirm-email` with
   `{"token": "<token>"}`.
3. A success response confirms the account is verified and the token deleted.


### Multi-factor authentication

Run `POST /auth/setup-mfa` while authenticated to generate a TOTP secret.
Scan the returned `otp_auth_url` in an authenticator app or use the SMS code
sent to your phone. Verify the code via `POST /auth/confirm-mfa` to finish
enabling MFA. Generate backup codes anytime with `POST /auth/recovery-codes` and
store them somewhere safe. You can disable MFA later by calling
`POST /auth/disable-mfa` with either a current TOTP or one of the recovery
codes. Subsequent logins require the verification step provided by
`POST /auth/verify-mfa`. The login page automatically prompts for this
verification code whenever a login response includes `mfa_required`.

### Login rate limiting

Failed login attempts are tracked per user and IP using Redis. After
`MAX_LOGIN_ATTEMPTS` failures within `LOGIN_ATTEMPT_WINDOW` seconds,
`POST /auth/login` responds with **429 Too Many Requests**. A successful
login resets these counters. Set the limits in your `.env` file:

```bash
MAX_LOGIN_ATTEMPTS=5       # number of failures before lockout
LOGIN_ATTEMPT_WINDOW=300   # rolling window in seconds
```

### Retrieve current user

`GET /auth/me` returns the authenticated user's profile when supplied with a
valid bearer token. Use this after OAuth logins where the frontend only gets a
JWT in the redirect URL.

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
npm run lint:css
```
Run `lint` to check TypeScript and JavaScript files with ESLint.
The `lint:css` script uses Stylelint to enforce consistent
conventions across our CSS files.

### Testing

Before using the regular test runner, populate the dependency caches by running

```bash
DOCKER_TEST_NETWORK=bridge ./scripts/docker-test.sh

Running with `DOCKER_TEST_NETWORK=bridge` ensures the initial install can reach
the package registries. Once the caches exist you can omit this flag to stay
offline.
```

This command copies `backend/venv` and `frontend/node_modules` from the Docker
image. Running `./scripts/test-all.sh` alone will fail if these directories do
not exist because `setup.sh` cannot install packages offline.

```bash
./scripts/test-all.sh
```
This script runs `pytest`, executes Jest using Node, and finally
`npm run lint`. Running the CLIs directly avoids missing binary errors when
`node_modules/.bin` links are not created. `setup.sh` skips dependency
installation when packages are already present so repeated test runs are much
faster. The test script now verifies that `node` and `npm` are available,
logs their versions, prints the full path and version of the Jest binary, and
exits with a helpful message if the binary is missing (for example, when
`npm ci` was interrupted).
After `npm ci` completes, the Node version is recorded in `frontend/node_modules/.meta`.
Python installs write the version to `backend/venv/.meta`. These meta files
and the lockfile hashes allow `setup.sh` to determine when reinstalling is
necessary.
Each cache also stores a SHA256 hash of its lock file
(`backend/venv/.req_hash` for `requirements.txt` and
`frontend/node_modules/.pkg_hash` for `package-lock.json`). `setup.sh` compares
these hashes to the current files and reinstalls the dependencies only when the
hashes differ.

`setup.sh` verifies that both `pip install` and `npm ci` succeed before
updating the cache metadata. If either step fails, the script prints an error
and suggests running `./scripts/docker-test.sh` with network access to fetch the
required packages. The `.req_hash`, `.pkg_hash`, and `.meta` files are written
only after successful installs so failed downloads do not pollute the cache.

If the cached virtual environment is missing and no internet connection is
available, `setup.sh` aborts before running `pip install` and prints:

```
❌ Dependencies missing and network unavailable.
Run ./scripts/docker-test.sh with DOCKER_TEST_NETWORK=bridge to fetch packages.
```

**Important:** run `./setup.sh` or `./scripts/docker-test.sh` once with network
access so these marker files are created. Subsequent offline runs reuse the
cached `backend/venv` and `frontend/node_modules` directories. When using
`docker-test.sh` for the first time, allow network access (for example by
setting `DOCKER_TEST_NETWORK=bridge`) so the script can copy the cached
dependencies from the image. After they exist, export
`BOOKING_APP_SKIP_PULL=1` and pass `--network none` to keep the environment
offline while reusing the caches.
Tests now run for every commit by default. Use `SKIP_TESTS=1` only when you
really need to bypass them (for example in a documentation-only hotfix).

After modifying any frontend component, run `./scripts/test-all.sh` to verify
that Jest tests and lint checks still pass.

You can override the number of parallel Jest workers by setting the
`JEST_WORKERS` environment variable. `test-all.sh` passes this value to
`npm test` using Jest's `--maxWorkers` flag, so you can control concurrency:

```bash
JEST_WORKERS=75% ./scripts/test-all.sh
```

The test runner also checks which directories changed. If no files under
`backend/` changed, it sets `SKIP_BACKEND=1` automatically, and likewise for
`frontend/`. End-to-end tests run only when files in `frontend/e2e/` changed and
the branch is `main` or `E2E=1` is set.

Set `FAST=1` to run `scripts/fast-check.sh` which only lints and tests files
changed since `main`. This mode skips dependency installation entirely so caches
must already exist. Run lint checks by exporting `LINT=1` (they also run
automatically in CI).
Use `WRITE_ARCHIVES=1` to rebuild the compressed dependency caches after
installing packages. Hashes combine the lock files and the runtime versions so
caches refresh automatically when either changes.
Dependency checks rely on `.venv_hash`, `.pkg_hash`, and `.meta` files.

Common skip flags:

```bash
SKIP_FRONTEND=1 ./scripts/test-all.sh
SKIP_BACKEND=1 ./scripts/test-all.sh
./scripts/test-frontend.sh --unit
```

The scripts cache `backend/venv` and `frontend/node_modules` using hash files so
installs are skipped unless `requirements.txt` or `package-lock.json` change.

You can also run the tests inside the Docker image if you prefer not to install
anything locally:

```bash
docker build -t booking-app:latest .
docker run --rm booking-app:latest ./scripts/test-all.sh
```

If your CI environment has no external network access, build the image ahead of
time with connectivity so all dependencies are cached. The `setup.sh` script
skips downloads when packages are already present, so repeat runs are fast even
when network access is blocked. You can then run the tests offline:

```bash
docker run --rm --network none booking-app:latest ./scripts/test-all.sh
```

Run quick smoke tests in Docker with:

```bash
SMOKE=1 ./scripts/test-all.sh
```

Force end-to-end tests to execute inside Docker even on non-main branches:

```bash
E2E=1 ./scripts/test-all.sh
```

### Playwright E2E Tests

The end-to-end tests live under `frontend/e2e` and run against a production
build of the Next.js app. A lightweight stub server and request interceptors
simulate all backend and external APIs so the tests work offline. Execute them
with:

```bash
npx playwright test
```

Before running the suite for the first time, download the browsers used by
Playwright:

```bash
npx playwright install --with-deps
```

The suite now includes `client-deposit-flow.spec.ts`, which verifies the
deposit payment process on an iPhone 14 Pro viewport. A new
`full-booking.spec.ts` exercise walks through signup, requesting a quote and
paying the deposit using mocked APIs across all default Playwright projects.
An additional `auth-flow.spec.ts` covers registration, social sign-in buttons
and email confirmation states.
The flight search integration also has unit tests that mock the external API so
no network calls are made during `./scripts/test-all.sh`.

### Offline Testing with Docker

If `setup.sh` cannot install dependencies (for example in an isolated CI
environment), build or pull the Docker image once with network access so the
cached dependencies are copied into your repository.

1. **Populate caches with connectivity**

```bash
DOCKER_TEST_NETWORK=bridge BOOKING_APP_BUILD=1 ./scripts/docker-test.sh
```

This command builds (or pulls) the image and copies `backend/venv` and
`frontend/node_modules` from the container. After it finishes you should have
`backend/venv/.meta` and `frontend/node_modules/.meta` in your working tree.
It also
archives these directories using `tar --use-compress-program=zstd` into
`backend/venv.tar.zst` and `frontend/node_modules.tar.zst` so they can be
restored later without Docker.

2. **Run tests offline**

```bash
BOOKING_APP_SKIP_PULL=1 DOCKER_TEST_NETWORK=none ./scripts/docker-test.sh
```

The script detects these caches and skips all installation steps. Set
`BOOKING_APP_IMAGE` to override the tag or `BOOKING_APP_BUILD=1` to build the
image when it is not found locally. The script automatically falls back to
`./scripts/test-all.sh` when Docker is unavailable.

The `.req_hash` and `.pkg_hash` files are copied along with the caches so the
setup script can detect when lock files change.

When run with `DOCKER_TEST_NETWORK=none`, the script checks that the dependency
caches already contain `.venv_hash` and `.pkg_hash` before launching the
container. If either cache is missing, it prints a warning like
`❌ Cached dependencies missing` and exits, advising you to rerun with
`DOCKER_TEST_NETWORK=bridge` so the dependencies can be copied over. Once the
caches are in place, future runs with `--network none` complete quickly because
the cached directories are reused.

If `setup.sh` still tries to run `pip install` or `npm ci`, it means the marker
files were not copied correctly. Rerun `scripts/docker-test.sh` with
`DOCKER_TEST_NETWORK=bridge` so the setup step can download the dependencies
 and recreate the caches. When the caches are missing but the `.tar.zst` (or
 `.tar.gz`) archives exist, `docker-test.sh` extracts them automatically before running tests so the
marker files are preserved.

Each run of `docker-test.sh` also updates these archives if the directories
 exist. Subsequent offline runs look for `backend/venv.tar.zst` (or `.tar.gz`) and
 `frontend/node_modules.tar.zst` (or `.tar.gz`); if the directories are missing but the archives
 are present, the script unpacks them with `tar --use-compress-program=unzstd -xf` or `-zxf` accordingly
before calling `setup.sh`.

### Building and Using Offline Caches

The `scripts/build-caches.sh` helper archives `backend/venv` and
`frontend/node_modules` so `setup.sh` can restore them without any network.
Hashes of the lock files combined with the Python and Node versions are stored
in `.venv_hash` and `.pkg_hash`. When these hashes match, `setup.sh` simply
extracts the archives; otherwise it reinstalls and refreshes the tarballs when
`WRITE_ARCHIVES=1` is set.

To update the caches manually run:

```bash
WRITE_ARCHIVES=1 ./setup.sh
```

This creates `backend/venv.tar.zst` (or `.tar.gz`) and `frontend/node_modules.tar.zst` (or `.tar.gz`) using
`zstd` when available (falling back to gzip). CI uploads these archives as
artifacts and restores them on subsequent runs.

If you update `requirements.txt` or `package-lock.json`, run
`BOOKING_APP_BUILD=1 ./scripts/docker-test.sh` (or rebuild the image manually)
so the caches include the new packages. The script stores the hashes in
`.req_hash` and `.pkg_hash` and automatically reinstalls when those hashes no
longer match the current lock files.

### Dependency Caching

To speed up CI builds and local Docker runs, reuse package caches between
invocations whenever possible.

- **Node**: share `~/.npm` or `~/.cache/yarn` across runs. When calling `npm ci`,
  add `--prefer-offline --no-audit --progress=false` to minimize network access
  and log noise. In Dockerfiles, copy `package*.json` into their own layer and
  run `npm ci` so cached layers are reused until the lock file changes.
- **Python**: set `pip`'s cache directory via `--cache-dir=/pipcache` and consider
  pointing to a local wheelhouse or mirror. Installing `requirements.txt` in its
  own Docker layer lets subsequent builds skip downloads when the file is
  unchanged.
- **Images**: build a “fat” base image that already contains `node_modules/` and
  the Python virtual environment. CI can pull this image and run tests without
  reinstalling dependencies each time.

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

### Quick Quotes

* **Endpoint** under `/api/v1/quotes/calculate`.
* Quote calculations are integrated into the booking wizard and message threads.
* Quote API factors travel distance and accommodation.
* New quote endpoints: `POST /api/v1/quotes`, `GET /api/v1/quotes/{id}`, and
  `POST /api/v1/quotes/{id}/accept` create simplified bookings when a client
  accepts.
* Quote V2 routes are now registered before the legacy ones so `GET /api/v1/quotes/{id}`
  correctly returns the new format and avoids 404 errors.
* Quote notifications now link to `/quotes/{id}` so users can view accepted
  quotes directly from the notification list.
* Quote API responses omit the nested `booking_request` field to avoid
  circular references.
* POST `/api/v1/booking-requests/{id}/quotes` now returns a Quote with
  `booking_request` set to `null` to prevent serialization cycles.
* Sending a quote automatically transitions the booking request to
  `quote_provided` status and displays the quote in the chat with a 7-day expiration.
* `POST /api/v1/quotes` returns **404 Not Found** when the
  `booking_request_id` does not match an existing request.
* Accepting a Quote V2 now also creates a formal booking visible on the artist dashboard.
* Accepted quotes now include a `booking_id` referencing the formal booking when
  retrieved via `GET /api/v1/quotes/{id}` so clients can load booking details.
* `GET /api/v1/quotes/{id}/pdf` downloads a PDF version of the quote.
* `POST /api/v1/quotes/{id}/accept` accepts an optional `service_id` query
  parameter when the related booking request was created without one.
  The response returns a `BookingSimple` summary. To load full booking details,
  refetch the quote for its `booking_id` and then query `/api/v1/bookings/{id}`.
* If the booking request is for a **Live Performance** and lacks a
  `proposed_datetime_1`, the accept endpoint returns `422` with the message
  "Booking request is missing a proposed date/time." Other service types can be
  accepted without supplying a date.
* Frontend helper `acceptQuoteV2(quoteId, serviceId?)` automatically appends
  `?service_id={serviceId}` to this request when a service ID is provided.
* The client quote detail page now uses this endpoint when clients click **Accept**.
* React hooks `useSendQuote`, `useAcceptQuote`, and `useDeclineQuote` wrap these quote endpoints and return typed `Message` data with the shared `BookingStatus` enum.
* Quote V2 error handling logs the acting user and quote details and returns structured responses for easier debugging.
* Backend helper `error_response` now logs its message and field errors before raising an exception.
* Many endpoints previously raising `HTTPException` directly now return this structured error format for consistency.
* Accepting a quote may respond with **500 Internal Server Error** if booking creation fails.
* Legacy quotes can still be accepted or rejected via `PUT /api/v1/quotes/{id}/client` when the newer `/accept` route is unavailable.
* Artists can save **Quote Templates** via `/api/v1/quote-templates` and apply them when composing a quote.
* Manage templates from **Dashboard → Profile → Quote Templates**.
* Failed quote acceptance or decline attempts now display a clear error message in the chat thread.

### Booking Wizard

* Reusable, centered progress bar and `useBookingForm` hook.
* “Request Booking” buttons on service cards.
* New **Review** step showing cost breakdown and selections.
* The review page now displays a single optimized summary with event type and
  details and calculates a price estimate based on distance.
* Travel estimates now include artist-specified car rental and flight prices when provided.
* Success toasts when saving a draft or submitting a request.
* Simplified buttons sit below each step in a responsive button group. On phones
  the order is **Next**, **Save Draft**, **Back** but remains **Back**, **Save Draft**,
  **Next** on larger screens.
* Next step components preload when the browser is idle for smoother navigation.
* Quote estimates are cached locally for up to 5 minutes with least-recently-used
  eviction after 50 entries to avoid redundant preview requests.
* Guests step now matches the others with Back, Save Draft, and Next buttons.
* Attachment uploads in the notes step display a progress bar and disable the Next button until finished.
* Collapsible sections ensure only the active step is expanded on phones.
* Mobile devices use native date and time pickers for faster input.
* Each step appears in a white card with rounded corners and a subtle shadow.
* The progress bar now stays pinned just below the header on phones so progress remains visible while scrolling through each step.
* Venue picker uses a reusable `<BottomSheet>` component on small screens to
  avoid keyboard overlap. The sheet traps focus for accessibility, exposes a
  `title` via `Dialog.Title` and `aria-labelledby`, and closes when you press
  `Escape` or tap outside.
* Sound and venue type buttons now correctly reflect the selected option and are
  included in the booking summary.
* Booking summary fonts now match the step cards for a more polished look.
* Input fields no longer auto-focus on mobile so the on-screen keyboard stays hidden until tapped.
* Booking summary is hidden by default and can be expanded with a "Show Details" toggle.
* Steps now animate with **framer-motion** and the progress dots stay clickable for all completed steps.
* Redesigned wizard uses animated stepper circles and spacious rounded cards for each step. Buttons have improved focus styles and align responsively.
* The flow now begins with **Event Details** followed by **Location** and **Date & Time** so clients describe their event before other specifics.
* Progress and form values persist to `localStorage`. Opening the booking wizard
  again prompts you to resume or start over. Saved data clears automatically
  after submission or when you reset the wizard.
* The wizard opens in a modal when clicking **Request Booking** on an artist page, avoiding a page navigation.

### Open Tasks

- ~~Review cross-browser support for the new collapsible summary sidebar and consider a custom toggle for non-standard browsers.~~ Cross-browser behavior verified in WebKit and Chrome.

### Real-time Chat

* WebSocket-powered updates via a reusable `useWebSocket` hook with automatic reconnection.
* The hook now closes stale sockets and clears reconnect timers to prevent browser "Insufficient resources" errors during repeated failures.
* Polished bubbles with timestamps, avatars, image previews.
* Consecutive messages from the same sender now group together, showing the
  relative time only below the last bubble.
* 1-on-1 threads show the participant avatar and name only in the header for a cleaner look.
* Chat headers now display the other participant's name so clients see the artist's business name and artists see the client's name.
* Fixed input bar & auto-scroll on mobile.
* Desktop bubbles expand wider to avoid unnecessary line breaks.
* Floating “scroll to latest” button on small screens.
* File uploads show an inline progress bar and the send button is disabled until complete.
* Message composer now accounts for the mobile bottom navigation, staying above it with safe-area padding.
* Emoji button toggles a searchable picker powered by `emoji-mart` so messages can include emoji.
* Artists can now review itemized quotes in a **View Quote** modal. Quote numbers are generated automatically, today's date appears, and a short description can be added. A compact **Choose template** dropdown sits beside the "View Quote" title and the **Add Item** button now sits below the travel fee. The bottom of the modal mirrors the booking review step with an estimated cost breakdown and a **Submit Request** button. Clients can accept or decline, and accepted quotes show a confirmation banner.
* When booking details include estimated costs, the modal pre-fills the service, travel, and sound fees so artists have a starting point.
* The modal uses the same horizontal layout for service, sound, travel, and discount fees as the "Add Item" rows. Added line items now share the same bordered row styling with padding and rounded corners so everything aligns consistently. These fee fields are editable so artists can enter amounts directly. Future releases will add PDF preview, currency symbols inside inputs, and an artist signature/terms block.
* Accepting a quote now creates a booking instantly and notifies both parties.
* Clients can once again accept quotes directly from the message thread.
* Fixed issue where quotes sent via the thread were missing because no chat message was recorded.
* GET `/api/v1/quotes/{id}` now logs missing IDs and returns "Quote {id} not found" for easier debugging.
* Upload progress and new message alerts are announced to screen readers.
* Personalized Video flow: multi-step prompts, typing indicators, progress bar.
* Sticky input demo at `/demo/sticky-input` shows local message appending.

### Notifications

* Persisted via `/api/v1/notifications` & `/api/v1/notifications/message-threads`.
* `/notifications/message-threads` now returns a `booking_details` object when a thread contains a booking details message.
* Bell icon in header; slide-out drawer on mobile.
* Clipboard icon opens `/booking-requests` with an unread badge.
* Unified feed combines booking updates and message threads.
* Mark-as-read endpoints and “Mark All as Read”.
* Individual notifications are updated via `PUT /api/v1/notifications/{id}/read` and all can be cleared with `PUT /api/v1/notifications/read-all`.
* `PUT /api/v1/booking-requests/{id}/messages/read` marks all messages in a thread as read.
* "Unread Only" toggle filters message threads and alerts in the drawer and full-screen modal.
* Notification lists now use **react-window** for virtualization so scrolling large histories is smoother. Install `react-window` if you upgrade dependencies manually.
* Grouped notification views are now generated in the UI from `/notifications` and the old `/notifications/grouped` endpoint was removed.
* Optional SMS alerts when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are set in the backend environment.
* Personalized video flows suppress chat alerts until all prompts are answered. A single notification is sent with the booking type once complete.
* System-generated booking details messages do not create extra chat alerts; a single booking request notification is sent after the form is submitted.
* Booking notes are visible only on the Booking details page, appearing beneath the Venue Type line in the details box, and are hidden from chat threads and booking request screens.
* Booking details messages appear in chat threads inside a collapsible section with a **Show details** button that toggles to **Hide details** when expanded. The details are collapsed by default so the header shows **Show details** until the section is opened. Small chevron icons indicate the state.
* Notification drawer cards use a two-line layout with subtle shadows and collapse/expand previews. Titles and subtitles wrap up to two lines using the `line-clamp-2` utility so full names remain visible.
* Avatars fall back to a default placeholder image when no profile photo is available so every notification displays a consistent picture.
* The drawer slides in from the right on a simple white panel with a soft shadow. Badges disappear when the unread count is 0.
* Notification cards keep softly rounded corners and a gentle shadow. Unread items show a thin brand-colored strip on the left.
* Each card displays a circular avatar, bold title, one-line subtitle, relative timestamp and a small status icon on the right. Icons are color-coded (green for confirmed, indigo for reminders, amber for due alerts).
* The header now just shows the “Notifications” title, an **Unread** toggle and a close **X** button.
* Deposit due alerts now display "Booking confirmed – deposit R{amount} due by {date}" only the first time a booking is confirmed. Subsequent reminders omit the greeting. The drawer parses this format to show `R50.00 due by Jan 1, 2025` as the subtitle and links directly to the booking.
* Booking confirmed and deposit due notifications now show the artist's avatar so users can immediately recognize who the alert is from. When the artist hasn't uploaded a photo, the default avatar is used.
* Quote acceptance and booking confirmation notifications now render dynamic titles such as **"Quote accepted by Jane Doe"** instead of a generic label.
* Message notifications now include the sender name in both the stored text and the API response so the drawer can display "New message from Alice" without additional lookups.
* Clicking a new message alert opens `/inbox?requestId={id}` with the conversation active.
* When an artist sends or declines a quote, the client is alerted with a new message notification that links straight to that conversation.
* Legacy `/messages/{id}` and `/messages/thread/{id}` URLs now redirect to the Inbox so older links remain valid.
* All notifications now include the sender's profile picture when available so avatars render consistently for artists and clients.
* Artists marking a booking **completed** now trigger a **REVIEW_REQUEST** notification. The alert links to `/dashboard/client/bookings/{booking_id}?review=1` so clients can immediately leave feedback.
* Chat message groups display a small unread badge on the right side when new messages arrive, clearing automatically once read. A **Jump to unread** button quickly scrolls to the first unseen message and messages you send show a subtle *Seen* label once the recipient reads them.
* File uploads now render PDF or document icons for non-image attachments so previews are clearer.
* Day divider lines show the full date, while relative times remain visible next to each message group.
* Booking request notifications display the sender name as the title and the service type in the subtitle with contextual icons. Service names are converted from `PascalCase` or `snake_case` and truncated for readability. The `/api/v1/notifications` endpoint now includes `sender_name` and `booking_type` fields so the frontend no longer parses them from the message string. When this data is missing, the client falls back to extracting the name from phrases like `"New message from Bob:"`.
* Deposit due, new booking and status update alerts also populate `sender_name` with the relevant artist or client so titles are consistent across notification types.
* New `useNotifications` context fetches `/api/v1/notifications` with auth and listens on `/api/v1/ws/notifications?token=...` for real-time updates. Notifications are reloaded every 30&nbsp;seconds via a shared Axios instance. The drawer components live under `components/layout/`.
* Wrap the root layout in `<NotificationsProvider>` so badges and drawers update automatically across the app.
* A new `parseNotification` utility maps each notification type to a friendly title, subtitle and icon. `<NotificationCard>` consumes this data and opens the related link while marking the item read.
* Unread notifications show a subtle brand-colored strip on the left while read cards remain plain white.
* `NotificationCard` in `components/ui/` displays a single alert with the same soft shadowed style used in the drawer.
* `getNotificationDisplayProps` converts a `Notification` or unified feed item into the props required by `NotificationCard`.
* API responses include `sender_name` and `link` fields used by the UI for titles and navigation. See [docs/notifications.md](docs/notifications.md).

### Artist Profile Enhancements

* ARIA roles, clearer empty states, optional subtitle/tagline.
* Shared `Card`, `Tag`, `TextInput` components.
* Open Graph meta tags and fallback avatars.
* The placeholder avatar is now square (1:1 aspect ratio) to avoid Next.js console warnings.
* Profile images across the UI now automatically fall back to `/static/default-avatar.svg` if the requested file cannot be loaded.
* Missing images now respond with the appropriate `Content-Type` header (`image/jpeg` or `image/png`) so Next.js can display the fallback without warnings.
* Accessibility and animation improvements.
* Dashboard stats now animate on load using **framer-motion**.
* Service provider cards display star ratings and verified badges. Prices only appear when `price_visible` is true.
* `<ServiceProviderCard />` now accepts `rating`, `ratingCount`, `priceVisible`, `verified`, and `isAvailable` props so listings can show review data. Review counts are no longer displayed, but the `rating` value still renders beside a star icon. You may also pass `specialities` as an alias for `specialties`. Availability information remains in the data layer but is hidden from the UI.
* Fixed a console warning by omitting the `isAvailable` prop from the underlying DOM element.
* The card layout was revamped: the photo stacks above the details on mobile and sits left on larger screens. Taglines clamp to two lines using the new Tailwind `line-clamp` plugin. Pricing appears beneath the provider name when `priceVisible` is true or shows **Contact for pricing** otherwise.
* Final polish aligns `<ServiceProviderCard />` with the global design system. The image now stretches edge to edge with only the top corners rounded. Specialty tags truncate to a single row and use pill badges with `text-[10px] px-1.5 py-0.5` styling. Ratings show a yellow star or "No ratings yet". Prices display as `from R{price}` with no decimals. A divider separates meta info from the location and **View Profile** button.
* Specialty badges now always show at most two tags using `flex-nowrap` and `overflow-hidden` so the row stays visible on small screens without truncation.

### Service Management (Artist Dashboard)

* Edit, delete, and reorder services by long‑pressing the handle in the top-right corner and dragging the card. Text selection is disabled for smoother reordering.
* Drag handle now reliably activates on mobile by disabling default touch actions, capturing the pointer, and persisting the event during the long press until pointer up or cancel.
* Each service card uses its own drag controller so the correct card moves even after reordering. A subtle ring highlight shows which card is active while dragging, and it disappears when the card is dropped.
* A short vibration cues the start of reordering on devices that support it, using a persisted pointer event for reliability.
* The handle blocks the context menu so long presses don't select text, applying `user-select: none` only during drag so you can still highlight service details normally.
* Reordering keeps the first card below the **Your Services** heading by constraining drag movement to the list area.
* The grid now transitions smoothly to a single column during drag and shows a "Drag up or down" hint.
* Service deletion now requires confirmation to prevent mistakes.
* **Add Service** button now opens a full-screen wizard. Steps appear in a coral-accented stepper with keyboard focus trapping. Pricing is captured directly on the **Details** step, removing the previous **Packages** step. The final review mirrors earlier steps with image thumbnails before publishing.
* Add Service wizard validates fields on each keystroke with dynamic hints like "Need 3 more characters" and the **Next** button enables automatically once inputs are valid.
* A shared **BaseServiceWizard** powers category wizards for Musician, DJ, Photographer, Videographer, Speaker, Sound Service, Wedding Venue, Caterer, Bartender and MC & Host, providing consistent navigation, media uploads and API submission with image-only validation, thumbnail previews and removable selections.
* Dedicated add-service wizards for **DJ** and **Sound Service** now ship with the base flow, capturing genre and service descriptions respectively.
* Selecting **Live Performance** now reveals travel-related fields beneath the duration input. Artists can specify a travel rate in Rand per km (default R2.5) and the number of members travelling.
* This travel rate now also factors into airport transfer costs when flying so estimates remain consistent.
* The **Edit Service** modal now includes these travel fields so artists can update their rate per km and members travelling from the dashboard. These values are stored server-side so edits persist.
* The **Review Your Service** step now shows these travel details so they can be confirmed before publishing and accurately feed into travel cost calculations.
* A new tip in the **Upload Media** step reminds artists to use high-resolution images or short video clips (1920x1080) for a polished listing.
* The wizard uses a plain white overlay (`bg-white`) so the modal stands out and clicking outside closes it.
* "Total Services" card now links to `/services?artist=<your_id>` so you only see your listings.
* Mobile-friendly dashboard cards for bookings and requests with larger service action buttons.
* "Your Services" now appears in a collapsible section just like booking requests, keeping the dashboard tidy.
* Services display in a responsive card grid with placeholder images so each offering stands out.
* Removed the unused "Recent Activity" block.
* Booking request and booking lists show the five most recent items with a **View All** link to see the full history.
* New `/dashboard/bookings` page lists all bookings with links to their quotes.
* The dashboard Bookings tab now includes a **View All Bookings** link.
* New `/dashboard/client/quotes` page lists all quotes sent to the client. Endpoint
  `GET /api/v1/quotes/me/client` retrieves the client's quote history, and the
  main navigation now features a **My Quotes** link for client users. A dropdown
  filter lets clients view only `pending`, `accepted`, or `declined` quotes using
  the same endpoint's optional `status` query parameter.
* New `/dashboard/quotes` page lets artists manage their quotes. Endpoints
  `GET /api/v1/quotes/me/artist`, `PUT /api/v1/quotes/{id}/artist`, and
  `POST /api/v1/quotes/{id}/confirm-booking` allow updates and confirmations.
* The dashboard stats section now includes a **View All Quotes** link so artists can quickly jump to their quotes list.
* Booking request cards now show a **Quote accepted** label linking directly to the accepted quote.
* Booking request cards now include a **Manage Request** link that opens the request details page.
* Improved dashboard stats layout. Artists now see a monthly earnings card.

* Dashboard overview now highlights **New Inquiries**, **Total Services**, and **Earnings This Month**.

* A profile completion progress bar appears above the dashboard stats until the profile is 100% complete.
* Stats cards use a simple grid layout for quick reference.

* Currency values now use consistent locale formatting with `formatCurrency()`.
* Service API responses now include a `currency` field.
* Streamlined mobile dashboard with collapsible overview and sticky tabs.
* Booking requests on the dashboard can now be **sorted and filtered** client-side.
![Mobile dashboard states](docs/mobile_dashboard_states.svg)

### Redesigned Dashboard

The dashboard brings common actions to the surface with a tidy layout:

* **Profile progress** – a bar at the top shows how complete your service provider profile is. Updating services and media increases the percentage so you know when you are ready to promote your page.
* **Quick actions** – buttons for adding a service, updating your calendar, or sending a quote appear below the progress bar so frequent tasks are one tap away.
* **Bookings and requests lists** – the next five upcoming bookings and newest requests are summarized in side-by-side cards. Use the **Load More** button to reveal additional requests in batches of five.

![Dashboard components](docs/dashboard_overview.svg)

### Artist Availability

* `GET /api/v1/service-provider-profiles/{artist_id}/availability` returns `unavailable_dates`.
* Sidebar badges show up to five next available dates.

### Service Types

* New **service\_type** field:
  `"Live Performance"`, `"Virtual Appearance"`, `"Personalized Video"`, `"Custom Song"`, `"Other"`.
* Non–Live/Virtual services go directly to chat instead of the wizard.
* Personalized Video flow handled via `PersonalizedVideoFlow` wrapper and automated questions.

### Reviews

* `POST /api/v1/bookings/{booking_id}/reviews`
* `GET /api/v1/reviews/{booking_id}`
* `GET /api/v1/service-provider-profiles/{artist_id}/reviews`
* `GET /api/v1/services/{service_id}/reviews`
* Booking must have **status `completed`** before a review can be created.
* Request body requires `rating` (1–5) and optional `comment`.
* The review automatically stores the booking's `artist_id` and `service_id`.

### Redis Caching

* Caches heavy endpoints using Redis:
  * `/api/v1/service-provider-profiles/` artist lists (60 s TTL).
  * `/api/v1/travel-forecast` 3‑day weather by location (30 min TTL).
  * `/api/v1/service-provider-profiles/{id}/availability` results (5 min TTL).
  * `/api/v1/service-categories/` responses include `Cache-Control: public, max-age=3600`.
* Random jitter is added to each TTL to reduce cache stampedes.
* Cache keys include all relevant query parameters so each combination is stored separately.
* Fallback to the database or external API if Redis is unavailable.
* Connections close cleanly on API shutdown.
* The frontend service worker pre-caches the app shell, critical CSS, local icons, and Google Fonts using Next-PWA. A manifest at `/manifest.json` enables install prompts, and offline booking steps and chat messages are retried with exponential backoff when connectivity returns.

### Artist Listing Filters

`GET /api/v1/service-provider-profiles/` supports pagination and optional filters:

```
page=<number>&limit=<1-100>&category=<slug>&location=<substring>&sort=<top_rated|most_booked|newest>&minPrice=<number>&maxPrice=<number>&include_price_distribution=<true|false>
&when=<YYYY-MM-DD>
```

The `category` parameter accepts a lowercase slug such as `musician` or `videographer`.

When building query strings in JavaScript, format dates as pure `YYYY-MM-DD`
values to avoid validation errors:

```javascript
params.set('when', date.toISOString().split('T')[0]);
```

`minPrice` and `maxPrice` filter by the prices of services in the selected
`category`. If no category is provided, the range applies to any service the
artist offers. Additional service categories are supported automatically without
code changes. Pass `include_price_distribution=true` to return histogram data for
the filter modal. Custom range slider styles live in `frontend/src/app/globals.css`;
wrap them in `@layer components` so Tailwind does not purge the rules.

Profiles include `rating`, `rating_count`, and `is_available` fields. A new
`price_visible` boolean on each artist controls whether the hourly rate is
returned. Newly created profiles default to `true`.
Passing a `when` date returns only artists available on that day and sets
`is_available` accordingly.
When filtering by a specific `category`, each profile also includes
`service_price` showing the price of that service for the artist.

The redesigned listing page features a sticky search header. On desktop this
header collapses to a single segment that expands inline to show **Category**,
**Location** and **Date** fields, mirroring Airbnb’s style. The search icon sits
on the right in a pink pill. Clicking any part opens all fields together in one
popover, which floats above the header and closes on ESC or outside clicks. The
bar now sits directly beneath the global navigation whenever you visit
`/service-providers`, providing a consistent header across the site. A
`useMediaQuery('(min-width:768px)')` hook picks between this inline bar and the
mobile `SearchModal`. On mobile a compact summary displays the selected values;
tapping it opens the modal prefilled with those values. A **Filters** button
opens `FilterSheet` for sort and price range. On desktop the filter modal uses a React portal to keep its fixed overlay centered. The button stores chosen values locally until **Apply filters** is clicked, updating the URL and results. It then
shows a tiny pink dot when any filter is active. The page
rests on a soft gradient background from the brand color to white. When no
results match the current filters the page shows "No artists found" beneath the
header. Filter selections persist in the URL so sharing or reloading the page
keeps the current view, e.g.
`/service-providers?category=Live+Performance&location=NY&minPrice=0&maxPrice=200000`.

### Mobile Navigation & Inbox

* Persistent bottom nav on small screens (visible only when logged in) with compact 56px height.
* Bottom nav auto-hides when you scroll down and reappears when scrolling up.
* Unread message counts badge on Messages icon. Badge now sits snugly over the icon on all devices.
* Chat attachment button stays inline with the message input and send button on all screens.
* Message and booking request attachments now upload reliably by clearing the default JSON `Content-Type` so Axios can set multipart boundaries automatically.
* Tap feedback on icons via `active:bg-gray-100`.
* **Inbox** page redesigned with a sticky "Messages" header and search icon. The left column lists conversations while the right shows the selected chat with booking details. Message notifications open directly to this page so clients can read and respond without hunting for the correct thread.
* URL parameters on `/inbox` include `requestId` to select a conversation. Artists receive an inline quote summary bubble instead of a modal, so the previous `sendQuote` flag has been removed.
* The inline quote form now surfaces booking event details with the same styling as the summary bubble, keeping artists in context while composing a quote.
* `/booking-requests` lists all requests with search and filters. Search and filter inputs now include hidden labels for screen readers.
* `ChatThreadView` component for mobile-friendly chat threads using a modern card-style layout.
* Tap a booking request card to open `/booking-requests/[id]`.
* Unread booking requests are highlighted in the brand palette so they stand out.
* Requests from the same client are grouped under a collapsible heading for a cleaner overview.
* Toggle buttons now include `aria-expanded` and `aria-controls` attributes and display a focus ring for keyboard users.
* Each request row now shows a red badge with its unread count next to the status.
* Threads with unread messages also show a small dot next to the timestamp until opened.

### Auth & Registration

* Password strength meter and success toast.
* Shared form components with optional Google/GitHub sign-in.
* Standard logins and OAuth tokens persist in `sessionStorage` so refreshing the page keeps you logged in, but closing the tab signs you out.
* Checking **Remember me** uses `localStorage` to keep you logged in across browser restarts.

---

## API Endpoints

### Booking Requests

```
POST /api/v1/booking-requests/
 Required: artist_id (int)
  Optional: service_id, message, proposed_datetime_1, proposed_datetime_2
```

422 responses indicate schema mismatches—ensure numeric fields are numbers and datetimes are valid ISO-8601 strings. Omit empty strings entirely.
Validation errors are now logged server-side and returned as structured JSON so you can quickly debug bad requests. When a specific field causes a problem the API includes a `field_errors` object mapping field names to messages.

Upon successful creation, the API saves the booking request with a `pending_quote` status and immediately posts a system message visible only to the artist with `action="review_quote"` so they can review details and send a quote.

The `messages` table includes an `action` column that stores these call-to-action tokens (for example, `review_quote` or `view_booking_details`). The frontend renders contextual buttons based on this value to guide users through next steps.

### Booking Request Parsing

```
POST /api/v1/booking-requests/parse
```

Submit free-form text describing an event and receive detected `event_type`, `date`, `location`, and `guests` values. Fields are omitted if not found. Explicit years in the text are honored; otherwise the current year is assumed.

Example request:

```json

{ "text": "Corporate gala for 40 people on 1 Jan 2026 in Durban" }
```

Example response:

```json
{
  "event_type": "Corporate",
  "date": "2026-01-01",
  "location": "Durban",
  "guests": 40
}

```

```json
{ "date": "2026-01-01", "location": "Durban", "guests": 40 }
```

422 responses include helpful messages when the text cannot be parsed. Server logs capture exceptions for debugging.

### Quote Confirmation

```
POST /api/v1/quotes/{quote_id}/confirm-booking
```

Confirms a client-accepted quote and creates a formal booking. Validation
errors such as invalid quote status or missing `service_id` now return
descriptive 422 responses so clients can correct issues.

### Reviews

```
POST /api/v1/bookings/{booking_id}/reviews
GET  /api/v1/reviews/{booking_id}
GET  /api/v1/service-provider-profiles/{artist_id}/reviews
GET  /api/v1/services/{service_id}/reviews
```

### Artist Availability

```
GET /api/v1/service-provider-profiles/{artist_id}/availability
```

### Calendar Export

```
GET /api/v1/bookings/{booking_id}/calendar.ics
```
Returns an RFC 5545 compatible calendar entry using the `ics` library.

### Payments

```
POST /api/v1/payments
 Required: booking_request_id
 Optional: amount (defaults to the booking deposit), full (bool)
```
```
GET /api/v1/payments/{payment_id}/receipt
```
Returns the PDF receipt for a completed payment.
Omitting `amount` charges the booking's `deposit_amount`.
Sending `full: true` charges the remaining balance and marks the booking paid. Omitting it records a deposit and sets the status to `deposit_paid`.
The booking's `deposit_amount` field is preserved when paying the full amount so the original deposit total is retained.
The endpoint now verifies the booking belongs to the authenticated client and returns **403 Forbidden** if another user attempts payment.
Duplicate payments are rejected with **400 Bad Request** when the deposit is already paid.
Payment processing now emits structured logs instead of printing to stdout so transactions can be traced in production.
Set `PAYMENT_GATEWAY_FAKE=1` in the environment to bypass the real gateway during local testing. When enabled, `/api/v1/payments` returns a dummy `payment_id` and immediately marks the booking paid.
For the frontend, set `NEXT_PUBLIC_FAKE_PAYMENTS=1` to simulate a successful payment without calling the `/api/v1/payments` endpoint. This lets you test the booking flow entirely offline.
Set `PAYMENT_GATEWAY_URL` to your payment provider's base URL. The default `https://example.com` triggers a startup warning so you don't accidentally hit a placeholder endpoint.

When a client accepts a quote in the chat thread, the frontend now prompts them to pay a deposit via this endpoint. Successful payments update the booking's `payment_status` and display a confirmation banner.
The payment modal automatically fills in half the quote total as the suggested deposit, but clients can adjust the amount before submitting.
The amount field now displays this value formatted via `formatCurrency` and shows helper text indicating whether the deposit or full amount will be charged. Deposit due dates use the `PPP` format for brevity.
The payment modal heading now also displays the deposit due date beneath the title so clients can easily see the deadline.
The modal layout now adapts to narrow screens, trapping focus and scrolling internally so mobile users can submit using the keyboard's **Done** button.
Accepting a quote also creates a **DEPOSIT_DUE** notification formatted as `Booking confirmed – deposit R{amount} due by {date}`. The alert links to `/dashboard/client/bookings/{booking_id}?pay=1` so clients can pay immediately. The drawer parses the amount and date from this message and shows them as `R50.00 due by Jan 1, 2025` under the title.
Clients can also pay outstanding deposits later from the bookings page. Each
pending booking shows a **Pay deposit** button that fetches the latest deposit
amount from the server before opening the payment modal.
Adding `?pay=1` to a booking URL automatically opens this modal when the booking
loads if the payment status is still `pending`. Deposit reminder notifications
include this query string so clients can pay with one click.

All prices and quotes now default to **South African Rand (ZAR)**. Update your environment or tests if you previously assumed USD values.

### Travel Forecast

```
GET /api/v1/travel-forecast?location={city}
```
Returns a 3-day weather outlook for the provided location using data from `wttr.in`. Invalid locations return a structured 422 response with `{"location": "Unknown location"}` in `field_errors`.

### Driving Distance

```
GET /api/v1/distance?from_location={origin}&to_location={destination}&includeDuration=true|false
```
This endpoint proxies the Google Distance Matrix API so the browser avoids CORS
errors. Set the optional `includeDuration` flag to `true` to include travel
duration fields from Google. When omitted or set to `false`, the proxy strips
`duration` information from each element. Debug logging records the request
parameters and raw Google response to help diagnose issues like unexpected
`ZERO_RESULTS`.
When `includeDuration=true`, helpers like `getDrivingMetrics()` parse both the
distance and estimated driving time. All travel cost estimates in the booking
wizard now rely on this API via `getDrivingMetrics` instead of great-circle
distance calculations.

### Cheapest Morning Flight

```
GET /api/v1/flights/cheapest?departure={code}&arrival={code}&date=YYYY-MM-DD
```
Returns the lowest price for flights departing before noon between the given
IATA codes on the specified date. The backend queries a free flight search API
and returns `{ "price": 1234.56 }` when successful. Configure `FLIGHT_API_KEY`
in `.env` to enable lookups. Network errors yield a 502 response and the
frontend falls back to a static estimate during travel calculations.

### Travel Mode Decision

`calculateTravelMode()` in `frontend/src/lib/travel.ts` automatically decides whether an artist should fly or drive to an event. The helper geocodes the artist and event towns, finds the closest airport using great-circle distance, checks for supported routes and then compares the full flying cost (flights, transfers and car rental) with the driving estimate. Transfer distances use full airport names rather than raw coordinates so Google can find a drivable route from the traveller's location to the departure airport and from the arrival airport to the final destination. The function works with any South African location and returns a detailed cost breakdown. Driving and transfer costs are doubled to account for the return trip.  
The logic now factors in maximum transfer times, brutally long drives, total travel time and a small time-cost penalty so the cheapest option doesn't always win.

```ts
import { calculateTravelMode } from '@/lib/travel';

const mode = await calculateTravelMode({
  artistLocation: 'Cape Town, South Africa',
  eventLocation: 'Johannesburg, South Africa',
  numTravellers: 1,
  drivingEstimate: 5000,
  // per-km rate (driving and transfers); defaults to R2.5 when omitted
  travelRate: 2.5,
});
console.log(mode.mode, mode.totalCost);
```

Both the driving estimate and any airport transfers use the provided
`travelRate`. If omitted, the rate defaults to `R2.5` per kilometer.

The Booking Wizard now waits until you reach the **Guests** step to run this
check. Once both the artist and event locations are confirmed, the travel mode
and cost are calculated and shown in a summary card.

When submitting the booking request, the frontend now sends three extra fields:

* `travel_mode` – either `fly` or `drive`
* `travel_cost` – numeric estimate of the chosen mode
* `travel_breakdown` – JSON object with flight or driving details

These values are stored with the request and returned in the API response.


### Invoices

```
GET /api/v1/invoices/{invoice_id}
POST /api/v1/invoices/{invoice_id}/mark-paid
GET /api/v1/invoices/{invoice_id}/pdf
```
Fetching an invoice returns details including the amount due and current status.
`mark-paid` updates the invoice status to **paid** and records an optional payment method.
The PDF endpoint generates and downloads a basic invoice document.

`DEFAULT_CURRENCY` in `frontend/src/lib/constants.ts` exports this value for use across the app. Call `formatCurrency(value, currency?, locale?)` from `frontend/src/lib/utils.ts` to format amounts consistently. UI labels such as "Price" and "Hourly Rate" automatically display this currency.

Example usage:

```ts
import { formatCurrency } from '@/lib/utils';

formatCurrency(125); // => 'R 125,00'
formatCurrency(99.5, 'USD', 'en-US'); // => 'US$99.50'
```

### Customizing the currency

Set `DEFAULT_CURRENCY` in your `.env` file to change the backend currency code.
The value is exposed at `/api/v1/settings` so the frontend can fetch it. You can
also override it on the client by setting `NEXT_PUBLIC_DEFAULT_CURRENCY` in
`frontend/.env.local`.

```env
# .env
DEFAULT_CURRENCY=USD

# optional frontend override
NEXT_PUBLIC_DEFAULT_CURRENCY=EUR
```


---

## Troubleshooting & Common Errors

* **jest: not found**: Run `npm test` in `frontend/` (auto-installs via `pretest`).
* **Missing package.json**: Ensure you’re in `frontend/` before running `npm test` or `npm run lint`.
* **next: not found / ENOTEMPTY**: Reinstall in `frontend/` with `npm install` or `./setup.sh`.
* **Module not found: Can't resolve 'framer-motion'**: Run `npm install` in `frontend/` to pull the latest dependencies.
* **Packages missing after setup**: If you see errors like `next: command not found` or `cannot find module`, `npm ci` likely did not finish. Rerun `./setup.sh` or run `npm ci` inside `frontend/`. When offline, use `scripts/docker-test.sh` to restore dependencies.
* **npm ci fails with `ECONNRESET` or `ENETUNREACH`**: Your environment may
  block access to `registry.npmjs.org`. Configure a proxy and rerun with
  network bridging:
  `npm config set proxy http://proxy:8080`
  `npm config set https-proxy http://proxy:8080`
  `DOCKER_TEST_NETWORK=bridge ./scripts/docker-test.sh`
* **npm install failed**: `scripts/test-all.sh` shows the last npm debug log on
  failure. Verify your proxy settings or run
  `scripts/docker-test.sh` with `DOCKER_TEST_NETWORK=bridge` to install
  dependencies or refresh caches.
* **Outdated Docker cache**: If `docker-test.sh` fails due to missing packages,
  update the Docker image and allow network access:
  `BOOKING_APP_BUILD=1 DOCKER_TEST_NETWORK=bridge ./scripts/docker-test.sh`.
* Running `./scripts/test-all.sh` (or `./setup.sh` first) installs dependencies and
  prints the path to the Jest binary if it is missing.
* Use `scripts/docker-test.sh` when you need to run the tests completely offline
  with cached dependencies.
* **WebSocket closes immediately**: Ensure the booking request exists and your
  authentication token is valid. The chat connection now checks both
  `localStorage` and `sessionStorage` for the token, and stops reconnecting if
  the server closes with code `4401`.
* **Sound outreach schema mismatch**: If you see `sqlalchemy.exc.OperationalError`
  complaining about `sound_outreach_requests.supplier_booking_request_id`,
  restart the server so it can auto-add the missing columns.

---

## Local Test Instructions

1. **Backend tests** (repo root):

   ```bash
   pytest
   ```
   Set `PYTEST_RUN=1` to run tests against an in-memory SQLite database.
  The `scripts/test-backend.sh` helper exports this variable automatically.
  Ensure your Git remote `origin` points to
  `https://github.com/Charelk2/booking-app.git` (or the SSH equivalent).
  Both `scripts/test-backend.sh` and `scripts/test-all.sh` will rewrite an SSH
  remote to HTTPS automatically when network restrictions block port 22.

### Test environment variables

Backend tests load `.env.test` from the project root automatically. This file
defines dummy values so no real credentials are ever used during testing:

```env
GOOGLE_CLIENT_ID=id
GOOGLE_CLIENT_SECRET=sec
```

2. **Frontend lint**:

   ```bash
   cd frontend
   npm install
   npx eslint src
   npm run lint:css
   ```

### Brand Colors

The frontend uses a small **brand** palette defined in `tailwind.config.js`. The
primary hue is now pink (`#FF5A5F`) with matching dark and light variants.
These values are exposed as CSS variables in `globals.css` and referenced via
utility classes such as `bg-brand` and `bg-brand-dark`.


### Support Pages

Dedicated **FAQ** and **Contact** pages provide self-service help. They are
accessible from the main navigation on desktop and through the mobile menu.

### Design Guidelines

For an overview of layout spacing, typography and component styles, see
[docs/design_guidelines.md](docs/design_guidelines.md).
Additional CSS conventions are documented in
[docs/css_best_practices.md](docs/css_best_practices.md).
For the booking wizard HTML structure reference, see [docs/booking_wizard_layout.md](docs/booking_wizard_layout.md).

### Artist View Toggle

Artists can switch between managing their profile and acting as a client.
When logged in as an artist, the navigation bar shows **Today**, **View Profile**,
**Services**, and **Messages**. A **Switch to Booking** button toggles to the
client view, returning the standard navigation links and redirecting to the
homepage. When switching back to artist view you are taken to the artist
dashboard. In artist view the header search bar and compact search pill are
removed entirely so only the navigation links remain, including a single **View Profile** link. The header stays fully expanded and never compacts on scroll. The toggle appears left of the booking
request icon for quick access. On mobile the drawer lists both sets of links so
switching views is always possible. All other artist options are available from
the mobile menu or profile dropdown.

## Contributing

Before opening a pull request, run `./scripts/test-all.sh` to execute the
backend and frontend test suites.
Scaling and Performance
- See SCALE.md for a phased scaling checklist (Redis, Postgres, caching, images/CDN, SSR/ISR, WebSockets) and operational runbooks.
- AGENTS.md documents app “agents” and automation; together with SCALE.md it forms the core contributor guide.
