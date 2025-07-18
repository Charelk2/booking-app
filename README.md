# Booking App

This repository contains a FastAPI backend and a Next.js frontend.

The July 2025 update bumps key dependencies and Docker base images:

- **FastAPI** 0.115.12 (requires Starlette 0.46+)
- **Uvicorn** 0.34
- **React** 18.3 and **Next.js** 14.2
- **Python** 3.12.11
- **Node.js** 22 (v22.16.0)
- Minor fix: the artists listing now gracefully handles incomplete user data from the API.
- Artists page adds a **Load More** button that fetches additional results using
  the API's pagination parameters.
- Artists page redesigned with a responsive grid, animated filter bar, skeleton
  loaders and hover "Book Now" overlay for a modern, accessible look.
- Homepage includes a central search bar so visitors can quickly look up artists by
  destination and date.
- Bookings now track `payment_status`, `deposit_amount`, and `deposit_paid` in
  `bookings_simple`. The deposit amount defaults to half of the accepted quote
  total. Booking API responses now include these fields alongside
  `deposit_due_by`.
- A new `deposit_due_by` field records when the deposit is due, one week after a quote is accepted.
- Payment receipts are stored with a `payment_id` so clients can view them from the dashboard.
- Users can download all account data via `/api/v1/users/me/export` and permanently delete their account with `DELETE /api/v1/users/me`.
- Booking cards now show deposit and payment status with a simple progress timeline.
- Booking wizard includes a required **Guests** step.
- Date picker and quote calculator show skeleton loaders while data fetches.
- Google Maps and large images load lazily once in view to reduce first paint time.
- Client dashboards now include a bookings list with upcoming and past filters via `/api/v1/bookings/my-bookings?status=`.
- Each booking item in this list now includes a `deposit_due_by` field when the booking was created from a quote. This due date is calculated one week from the moment the quote is accepted.
- Artists can mark bookings completed or cancelled and download confirmed bookings as calendar (.ics) files generated with the `ics` library.
- Clients can leave a star rating and comment once a booking is marked completed. Service detail pages now display these reviews.
- A **Leave Review** button now appears in chat when a completed booking has no review.
- After accepting a quote, clients see quick links in the chat to view that booking, pay the deposit, and add it to a calendar.
- Artists can upload multiple portfolio images and reorder them via drag-and-drop. Use `POST /api/v1/artist-profiles/me/portfolio-images` to upload and `PUT /api/v1/artist-profiles/me/portfolio-images` to save the order.
- Quote modal items can now be removed even when only one item is present.

For a map of all booking agents, see [AGENTS.md](AGENTS.md).


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
virtual environment. A marker file `backend/venv/.install_complete` is also
added after a successful install along with a hash of `requirements.txt`
stored in `backend/venv/.req_hash`. `setup.sh` checks these files so
repeated runs skip `pip install` when nothing changed. Node dependencies live in `frontend/node_modules` with a corresponding hash stored in `frontend/node_modules/.pkg_hash`. Use a volume mount to iterate locally:

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

### Database migrations

Run `alembic upgrade head` whenever you pull changes that modify the database schema. The API will attempt to add missing columns such as `artist_profiles.price_visible`, `services.currency`, `bookings_simple.date`/`location`, `bookings_simple.payment_status`, `users.mfa_secret`/`mfa_enabled`, and `calendar_accounts.email` automatically for SQLite setups. Non-SQLite deployments should run the new Alembic migration after pulling this update. Simply starting the API will also add the new `calendar_accounts.email` column if it is missing.

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
`https://www.googleapis.com/auth/userinfo.email`, and `openid`.

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
If the API starts without `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` set, calendar syncing is disabled and a warning is logged.

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
```

The host portion of `NEXT_PUBLIC_API_URL` is also used by
`next.config.js` to allow optimized image requests from the backend.
Set this URL to match your API server so artist profile pictures and
cover photos load without 400 errors from the `/_next/image` endpoint.

The location input relies on the built-in Google Maps Places Autocomplete
service instead of the experimental `@googlemaps/places` package. The previous
dependency caused a build failure because it depended on Node-only modules like
`fs`. No additional npm install step is required after this change.
The embedded map only loads after a location is selected so the page renders
quickly.

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
the token from the `email_tokens` table.
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
```

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
The script drops a marker file `frontend/node_modules/.install_complete` after a
successful `npm ci` so subsequent runs skip reinstalling dependencies unless
that file is removed. After installing Python requirements, `setup.sh` creates
`backend/venv/.install_complete` so it can skip `pip install` on future runs.
Each cache also stores a SHA256 hash of its lock file
(`backend/venv/.req_hash` for `requirements.txt` and
`frontend/node_modules/.pkg_hash` for `package-lock.json`). `setup.sh` compares
these hashes to the current files and reinstalls the dependencies only when the
hashes differ.

`setup.sh` now verifies that both `pip install` and `npm ci` succeed before any
marker files are created. If either step fails, the script prints an error and
suggests running `./scripts/docker-test.sh` with network access to fetch the
required packages. The marker files (`.install_complete`, `.req_hash`, and
`.pkg_hash`) are written only after successful installs so failed downloads do
not pollute the cache.

If the virtual environment cache (`backend/venv/.install_complete`) is missing
and no internet connection is available, `setup.sh` aborts before running
`pip install` and prints:

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
`backend/venv/.install_complete` and
`frontend/node_modules/.install_complete` in your working tree. It also
archives these directories using `tar --use-compress-program=zstd` into
`backend/venv.tar.zst` and `frontend/node_modules.tar.zst` so they can be
restored later without Docker.

2. **Run tests offline**

```bash
BOOKING_APP_SKIP_PULL=1 DOCKER_TEST_NETWORK=none ./scripts/docker-test.sh
```

The script detects the marker files and skips all installation steps. Set
`BOOKING_APP_IMAGE` to override the tag or `BOOKING_APP_BUILD=1` to build the
image when it is not found locally. The script automatically falls back to
`./scripts/test-all.sh` when Docker is unavailable.

The `.req_hash` and `.pkg_hash` files are copied along with the caches so the
setup script can detect when lock files change.

When run with `DOCKER_TEST_NETWORK=none`, the script checks that the dependency
caches already contain `.install_complete` markers before launching the
container. If either cache is missing, it prints a warning like
`❌ Cached dependencies missing` and exits, advising you to rerun with
`DOCKER_TEST_NETWORK=bridge` so the dependencies can be copied over. Once the
caches are in place, future runs with `--network none` complete quickly because
the cached directories are reused.

If `setup.sh` still tries to run `pip install` or `npm ci`, it means the marker
files were not copied correctly. Rerun `scripts/docker-test.sh` with
`DOCKER_TEST_NETWORK=bridge` so the setup step can download the dependencies
and recreate the caches. When the caches are missing but the `.tar.zst` archives
exist, `docker-test.sh` extracts them automatically before running tests so the
marker files are preserved.

Each run of `docker-test.sh` also updates these archives if the directories
exist. Subsequent offline runs look for `backend/venv.tar.zst` and
`frontend/node_modules.tar.zst`; if the directories are missing but the archives
are present, the script unpacks them with `tar --use-compress-program=unzstd -xf`
before calling `setup.sh`.

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

### Sound Providers & Quick Quotes

* **Endpoints** under `/api/v1/sound-providers` and `/api/v1/quotes/calculate`.
* Frontend pages: `/sound-providers`, `/quote-calculator`.
* These pages now appear in the artist navigation menu.
* Quote API factors travel distance, provider fees, and accommodation.
* Providers can now be edited and artists may rank preferred providers via `/sound-providers`.
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
* `POST /api/v1/quotes` returns **404 Not Found** when the
  `booking_request_id` does not match an existing request.
* Accepting a Quote V2 now also creates a formal booking visible on the artist dashboard.
* Accepted quotes now include a `booking_id` referencing the formal booking when
  retrieved via `GET /api/v1/quotes/{id}` so clients can load booking details.
* `POST /api/v1/quotes/{id}/accept` accepts an optional `service_id` query
  parameter when the related booking request was created without one.
  The response now returns the newly created `BookingSimple` so the frontend
  can immediately fetch full booking details using the returned `id`.
* If the booking request is for a **Live Performance** and lacks a
  `proposed_datetime_1`, the accept endpoint returns `422` with the message
  "Booking request is missing a proposed date/time." Other service types can be
  accepted without supplying a date.
* Frontend helper `acceptQuoteV2(quoteId, serviceId?)` automatically appends
  `?service_id={serviceId}` to this request when a service ID is provided.
* The client quote detail page now uses this endpoint when clients click **Accept**.
* Quote V2 error handling logs the acting user and quote details and returns structured responses for easier debugging.
* Backend helper `error_response` now logs its message and field errors before raising an exception.
* Accepting a quote may respond with **500 Internal Server Error** if booking creation fails.
* Legacy quotes can still be accepted or rejected via `PUT /api/v1/quotes/{id}/client` when the newer `/accept` route is unavailable.
* Artists can save **Quote Templates** via `/api/v1/quote-templates` and apply them when composing a quote.
* Manage templates from **Dashboard → Profile → Quote Templates**.
* Failed quote acceptance or decline attempts now display a clear error message in the chat thread.

### Booking Wizard

* Reusable, centered progress bar and `useBookingForm` hook.
* “Request Booking” buttons on service cards.
* New **Review** step showing cost breakdown and selections.
* Success toasts when saving a draft or submitting a request.
* Simplified buttons sit below each step in a responsive button group. On phones
  the order is **Next**, **Save Draft**, **Back** but remains **Back**, **Save Draft**,
  **Next** on larger screens.
* Guests step now matches the others with Back, Save Draft, and Next buttons.
* Attachment uploads in the notes step display a progress bar and disable the Next button until finished.
* Collapsible sections ensure only the active step is expanded on phones.
* Mobile devices use native date and time pickers for faster input.
* Each step appears in a white card with rounded corners and a subtle shadow.
* The progress bar sticks below the header so progress is always visible while scrolling.
* Venue picker uses a reusable `<BottomSheet>` component on small screens to
  avoid keyboard overlap. The sheet traps focus for accessibility and closes when
  you press `Escape` or tap outside.
* Input fields no longer auto-focus on mobile so the on-screen keyboard stays hidden until tapped.
* Summary sidebar collapses into a `<details>` section on phones so you can hide the order overview.
* Steps now animate with **framer-motion** and the progress dots stay clickable for all completed steps.
* Redesigned wizard uses animated stepper circles and spacious rounded cards for each step. Buttons have improved focus styles and align responsively.

### Open Tasks

- ~~Review cross-browser support for the new collapsible summary sidebar and consider a custom toggle for non-standard browsers.~~ Cross-browser behavior verified in WebKit and Chrome.

### Real-time Chat

* WebSocket-powered updates via a reusable `useWebSocket` hook with automatic reconnection.
* Polished bubbles with timestamps, avatars, image previews.
* Consecutive messages from the same sender now group together, showing the
  relative time only below the last bubble.
* 1-on-1 threads show the participant avatar and name only in the header for a cleaner look.
* Fixed input bar & auto-scroll on mobile.
* Desktop bubbles expand wider to avoid unnecessary line breaks.
* Floating “scroll to latest” button on small screens.
* File uploads show an inline progress bar and the send button is disabled until complete.
* Artists can now send itemized quotes directly in the thread via a **Send Quote** modal. Quote numbers are generated automatically, today's date appears, and a short description can be added. A compact **Choose template** dropdown sits beside the "Send Quote" title and the **Add Item** button now sits below the travel fee. Totals highlight both the subtotal and overall total. Clients can accept or decline, and accepted quotes show a confirmation banner.
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
* "Unread Only" toggle filters message threads and alerts in the drawer and full-screen modal.
* Notification lists now use **react-window** for virtualization so scrolling large histories is smoother. Install `react-window` if you upgrade dependencies manually.
* Grouped notification views are now generated in the UI from `/notifications` and the old `/notifications/grouped` endpoint was removed.
* Optional SMS alerts when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are set in the backend environment.
* Personalized video flows suppress chat alerts until all prompts are answered. A single notification is sent with the booking type once complete.
* System-generated booking details messages do not create extra chat alerts; a single booking request notification is sent after the form is submitted.
* Booking notes are visible only on the Booking details page, appearing beneath the Venue Type line in the details box, and are hidden from chat threads and booking request screens.
* Booking details messages appear in chat threads inside a collapsible section with a **Show details** button that toggles to **Hide details** when expanded. Small chevron icons indicate the state.
* Notification drawer cards use a two-line layout with subtle shadows and collapse/expand previews. Titles and subtitles wrap up to two lines using the `line-clamp-2` utility so full names remain visible.
* Avatars fall back to the sender's initials when no profile photo is available, ensuring every notification has a recognizable icon.
* The drawer slides in from the right on a simple white panel with a soft shadow. Badges disappear when the unread count is 0.
* Notification cards keep softly rounded corners and a gentle shadow. Unread items show a thin brand-colored strip on the left.
* Each card displays a circular avatar, bold title, one-line subtitle, relative timestamp and a small status icon on the right. Icons are color-coded (green for confirmed, indigo for reminders, amber for due alerts).
* The header now just shows the “Notifications” title, an **Unread** toggle and a close **X** button.
* A full-width rounded **Clear All** button stays pinned to the bottom of the panel.
* Deposit due alerts now display "Booking confirmed – deposit R{amount} due by {date}" only the first time a booking is confirmed. Subsequent reminders omit the greeting. The drawer parses this format to show `R50.00 due by Jan 1, 2025` as the subtitle and links directly to the booking.
* Quote acceptance and booking confirmation notifications now render dynamic titles such as **"Quote accepted by Jane Doe"** instead of a generic label.
* Message notifications now include the sender name in both the stored text and the API response so the drawer can display "New message from Alice" without additional lookups.
* Artists marking a booking **completed** now trigger a **REVIEW_REQUEST** notification. The alert links to `/dashboard/client/bookings/{booking_id}?review=1` so clients can immediately leave feedback.
* Chat message groups display a small unread badge on the right side when new messages arrive, clearing automatically once read.
* Day divider lines show the full date, while relative times remain visible next to each message group.
* Booking request notifications display the sender name as the title and the service type in the subtitle with contextual icons. Service names are converted from `PascalCase` or `snake_case` and truncated for readability. The `/api/v1/notifications` endpoint now includes `sender_name` and `booking_type` fields so the frontend no longer parses them from the message string.
* Deposit due, new booking and status update alerts also populate `sender_name` with the relevant artist or client so titles are consistent across notification types.
* New `useNotifications` context fetches `/api/v1/notifications` with auth and listens on `/api/v1/ws/notifications?token=...` for real-time updates. Notifications are reloaded every 30&nbsp;seconds via a shared Axios instance. The drawer components live under `components/layout/`.
* Wrap the root layout in `<NotificationsProvider>` so badges and drawers update automatically across the app.
* A new `parseNotification` utility maps each notification type to a friendly title, subtitle and icon. `<NotificationCard>` consumes this data and opens the related link while marking the item read.
* Unread notifications show a subtle brand-colored strip on the left while read cards remain plain white.
* `NotificationCard` in `components/ui/` displays a single alert with the same soft shadowed style used in the drawer.
* `getNotificationDisplayProps` converts a `Notification` or unified feed item into the props required by `NotificationCard`.
* API responses include `sender_name` and `link` fields used by the UI for titles and navigation. See [docs/notifications.md](docs/notifications.md).
* A rounded **Clear All** button is fixed at the bottom so users can dismiss everything at once.

### Artist Profile Enhancements

* ARIA roles, clearer empty states, optional subtitle/tagline.
* Shared `Card`, `Tag`, `TextInput` components.
* Open Graph meta tags and fallback avatars.
* Profile images across the UI now automatically fall back to `default-avatar.svg` if the requested file cannot be loaded.
* Accessibility and animation improvements.
* Dashboard stats now animate on load using **framer-motion**.
* Artist cards display star ratings and verified badges. Prices only appear when `price_visible` is true.
* `<ArtistCard />` now accepts `rating`, `ratingCount`, `priceVisible`, `verified`, and `isAvailable` props so listings can show review data. Review counts are no longer displayed, but the `rating` value still renders beside a star icon. You may also pass `specialities` as an alias for `specialties`. Availability information remains in the data layer but is hidden from the UI.
* Fixed a console warning by omitting the `isAvailable` prop from the underlying DOM element.
* The card layout was revamped: the photo stacks above the details on mobile and sits left on larger screens. Taglines clamp to two lines using the new Tailwind `line-clamp` plugin. Pricing appears beneath the artist name when `priceVisible` is true or shows **Contact for pricing** otherwise.
* Final polish aligns `<ArtistCard />` with the global design system. The image now stretches edge to edge with only the top corners rounded. Specialty tags truncate to a single row and use pill badges with `text-[10px] px-1.5 py-0.5` styling. Ratings show a yellow star or "No ratings yet". Prices display as `from R{price}` with no decimals. A divider separates meta info from the location and **View Profile** button.
* Specialty badges now always show at most two tags using `flex-nowrap` and `overflow-hidden` so the row stays visible on small screens without truncation.

### Service Management (Artist Dashboard)

* Edit, delete, and reorder services by long‑pressing the handle in the top-right corner and dragging the card. Text selection is disabled for smoother reordering.
* Drag handle now reliably activates on mobile by disabling default touch actions, capturing the pointer, and persisting the event during the long press until pointer up or cancel.
* Each service card uses its own drag controller so the correct card moves even after reordering. A subtle ring highlight shows which card is active while dragging, and it disappears when the card is dropped.
* A short vibration cues the start of reordering on devices that support it, using a persisted pointer event for reliability.
* The handle blocks the context menu so long presses don't select text, applying `user-select: none` only during drag so you can still highlight service details normally.
* Reordering keeps the first card below the **Your Services** heading by constraining drag movement to the list area.
* Service deletion now requires confirmation to prevent mistakes.
* **Add Service** button now opens a modal to create a new service. It appears below your services list on all screen sizes.
* "Total Services" card now links to `/services?artist=<your_id>` so you only see your listings.
* Mobile-friendly dashboard cards for bookings and requests with larger service action buttons.
* "Your Services" now appears in a collapsible section just like booking requests, keeping the dashboard tidy.
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
* Artists can update or decline booking requests from the dashboard via a new **Update Request** modal.
* Improved dashboard stats layout. Artists now see a monthly earnings card.
* Currency values now use consistent locale formatting with `formatCurrency()`.
* Service API responses now include a `currency` field.
* Streamlined mobile dashboard with collapsible overview and sticky tabs.
  ![Mobile dashboard states](docs/mobile_dashboard_states.svg)

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
* Booking must have **status `completed`** before a review can be created.
* Request body requires `rating` (1–5) and optional `comment`.
* The review automatically stores the booking's `artist_id` and `service_id`.

### Redis Caching

* Caches `/api/v1/artist-profiles/` GET responses.
* Cache keys include page number, limit, and filter parameters so each combination is stored separately.
* Default Redis URL: `redis://localhost:6379/0`.
* Fallback to DB if Redis is unavailable.
* Connections close cleanly on API shutdown.

### Artist Listing Filters

`GET /api/v1/artist-profiles/` supports pagination and optional filters:

```
page=<number>&limit=<1-100>&category=<ServiceType>&location=<substring>&sort=<top_rated|most_booked|newest>
```

Profiles include `rating`, `rating_count`, and `is_available` fields. A new
`price_visible` boolean on each artist controls whether the hourly rate is
returned. Newly created profiles default to `true`.

The redesigned listing page features a rounded filter bar wrapped in a white
card with a subtle shadow. Chips use `rounded-full bg-sky-100 text-sky-800
px-3 py-1.5 text-sm` styling and highlight in `bg-sky-200 text-sky-900` when selected. The entire
page now rests on a soft gradient background from the brand color to white. A new
"Clear filters" button appears when any filter is active and resets all filter
inputs. When no results match the current filters the page shows "No artists
found" beneath the filter bar.

### Mobile Navigation & Inbox

* Persistent bottom nav on small screens (visible only when logged in) with compact 56px height.
* Bottom nav auto-hides when you scroll down and reappears when scrolling up.
* Unread message counts badge on Messages icon. Badge now sits snugly over the icon on all devices.
* Chat attachment button stays inline with the message input and send button on all screens.
* Tap feedback on icons via `active:bg-gray-100`.
* **Inbox** page at `/inbox` separates Booking Requests and Chats into tabs.
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
* "Remember me" option persists sessions using `localStorage` or `sessionStorage`.

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
Validation errors are now logged server-side and returned as structured JSON so you can quickly debug bad requests. When a specific field causes a problem the API includes a `field_errors` object mapping field names to messages.

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

### Brand Colors

The frontend uses a small **brand** palette defined in `tailwind.config.js`. The
primary hue is indigo (`#6366f1`), with `brand-dark` and `brand-light` variants.
Components reference these via utility classes such as `bg-brand` and
`bg-brand-dark`.


### Help Prompt

The `HelpPrompt` component renders quick links to the FAQ and contact page. It
is included once on every page via `MainLayout` so users always know where to
get assistance.

### Support Pages

Dedicated **FAQ** and **Contact** pages provide self-service help. They are
accessible from the main navigation on desktop and through the mobile menu.
