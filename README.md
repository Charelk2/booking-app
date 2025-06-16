# Booking App

This repository contains a FastAPI backend and a Next.js frontend.

The July 2025 update bumps key dependencies and Docker base images:

- **FastAPI** 0.115.12 (requires Starlette 0.46+)
- **Uvicorn** 0.34
- **React** 18.3 and **Next.js** 14.2
- **Python** 3.12
- **Node.js** 21
- Minor fix: the artists listing now gracefully handles incomplete user data from the API.
- Bookings now track `payment_status` in `bookings_simple`.
- Booking wizard includes a required **Guests** step.

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

If `DOCKER_TEST_NETWORK` isn't set and the caches are missing **or the
dependency hashes differ from the cached versions**, the script automatically
uses `--network bridge` and prints a notice so the updated packages can be
fetched.

2. **Run tests offline**

   ```bash
   BOOKING_APP_SKIP_PULL=1 DOCKER_TEST_NETWORK=none ./scripts/docker-test.sh
   ```

   Subsequent runs reuse the cached dependencies and pass `--network none` to
   avoid downloading packages, making the tests start much faster. The script
   detects when `requirements.txt` or `package-lock.json` changes and
   automatically switches to `--network bridge` so the caches are refreshed.
   You can still delete the caches or rebuild the image manually if needed.

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

The SQLite database path is automatically resolved to the project root, so you can start the backend from either the repo root or the `backend/` folder without creating duplicate database files.

### Database migrations

Run `alembic upgrade head` whenever you pull changes that modify the database schema. The API will attempt to add missing columns such as `artist_profiles.price_visible`, `services.currency`, `bookings_simple.date`/`location`, and `bookings_simple.payment_status` automatically for SQLite setups, but explicit migrations are recommended for other databases. Non-SQLite deployments should run the new Alembic migration after pulling this update.

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

Unhandled exceptions are returned as JSON 500 responses. The middleware now injects the appropriate `Access-Control-Allow-Origin` header even when errors occur, so browser clients never see a CORS failure when the API throws an exception.

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

To expose the app on your local network, replace `192.168.3.203` with your
machine's LAN IP. Set the same address in `backend/.env` under
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

API responses are now handled by a global interceptor which maps common HTTP
status codes to human-friendly error messages and logs server errors to the
console. Hooks and components no longer need to parse Axios errors manually.

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

When run with `DOCKER_TEST_NETWORK=none`, the script now checks that the
dependency caches already contain `.install_complete` markers before launching
the container. If either cache is missing, it prints a warning like
`❌ Cached dependencies missing` and exits, advising you to rerun with
`DOCKER_TEST_NETWORK=bridge` so the dependencies can be copied over. Once the
caches are in place, future runs with `--network none` complete quickly because
the cached directories are reused.
If `DOCKER_TEST_NETWORK` isn't set and these markers are absent **or the hash
files show the caches are outdated**, `docker-test.sh` automatically uses
`bridge` and prints a notice so the caches are populated without failing.

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
* Quote API factors travel distance, provider fees, and accommodation.
* New quote endpoints: `POST /api/v1/quotes`, `GET /api/v1/quotes/{id}`, and
  `POST /api/v1/quotes/{id}/accept` create simplified bookings when a client
  accepts.
* Quote V2 routes are now registered before the legacy ones so `GET /api/v1/quotes/{id}`
  correctly returns the new format and avoids 404 errors.
* Quote notifications now link to `/quotes/{id}` so users can view accepted
  quotes directly from the notification list.
* Quote API responses omit the nested `booking_request` field to avoid
  circular references.
* Accepting a Quote V2 now also creates a formal booking visible on the artist dashboard.

### Booking Wizard

* Reusable, centered progress bar and `useBookingForm` hook.
* “Book Now” buttons on service cards.
* New **Review** step showing cost breakdown and selections.
* Success toasts when saving a draft or submitting a request.
* Simplified buttons sit below each step in a responsive button group.
* Attachment uploads in the notes step display a progress bar and disable the Next button until finished.
* Collapsible sections for date/time and notes keep steps short on phones.
* Mobile devices use native date and time pickers for faster input.
* Each step appears in a white card with rounded corners and a subtle shadow.
* The progress bar sticks below the header so progress is always visible while scrolling.
* Venue picker uses a bottom-sheet on small screens to avoid keyboard overlap.
  The sheet now traps focus for accessibility and closes when you press
  `Escape` or tap outside.
* Input fields no longer auto-focus on mobile so the on-screen keyboard stays hidden until tapped.
* Summary sidebar collapses into a `<details>` section on phones so you can hide the order overview.
* Steps now animate with **framer-motion** and the progress dots stay clickable for all completed steps.

### Open Tasks

- Review cross-browser support for the new collapsible summary sidebar and consider a custom toggle for non-standard browsers.

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
* Artists can now send itemized quotes directly in the thread via a **Send Quote** modal. Clients can accept or decline, and accepted quotes show a confirmation banner.
* Accepting a quote now creates a booking instantly and notifies both parties.
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
* "Unread Only" toggle filters message threads and alerts in the drawer and full-screen modal.
* Notification lists now use **react-window** for virtualization so scrolling large histories is smoother. Install `react-window` if you upgrade dependencies manually.
* Optional SMS alerts when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are set in the backend environment.
* Personalized video flows suppress chat alerts until all prompts are answered. A single notification is sent with the booking type once complete.
* System-generated booking details messages do not create extra chat alerts; a single booking request notification is sent after the form is submitted.
* Booking details messages appear in chat threads inside a collapsible section with a **Show details** button that toggles to **Hide details** when expanded. Small chevron icons indicate the state.
* Notification drawer cards use a two-line layout with subtle shadows and collapse/expand previews. Titles are limited to 36 characters and subtitles to 30 so long names don't wrap.
* The drawer now opens as a rounded panel with a dark backdrop. Badges disappear when the unread count is 0. Adjust the badge styles in `frontend/src/components/layout/NotificationListItem.tsx`.
* Chat message groups display a small unread badge on the right side when new messages arrive, clearing automatically once read.
* Day divider lines show the full date, while relative times remain visible next to each message group.
* Booking request notifications display the sender name as the title and the service type in the subtitle with contextual icons. Service names are converted from `PascalCase` or `snake_case` and truncated for readability. The `/api/v1/notifications` endpoint now includes `sender_name` and `booking_type` fields so the frontend no longer parses them from the message string.

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
* **Add Service** button now opens a modal to create a new service. It appears after your services list on mobile and below stats on larger screens.
* "Total Services" card now links to `/services?artist=<your_id>` so you only see your listings.
* Mobile-friendly dashboard cards for bookings and requests with larger service action buttons.
* "Your Services" now appears in a collapsible section just like booking requests, keeping the dashboard tidy.
* Removed the unused "Recent Activity" block.
* Booking request and booking lists show the five most recent items with a **View All** link to see the full history.
* New `/dashboard/bookings` page lists all bookings with links to their quotes.
* The dashboard Bookings tab now includes a **View All Bookings** link.
* Booking request cards now show a **Quote accepted** label linking directly to the accepted quote.
* Improved dashboard stats layout with monthly earnings card.
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

### Redis Caching

* Caches `/api/v1/artist-profiles/` GET responses.
* Default Redis URL: `redis://localhost:6379/0`.
* Fallback to DB if Redis is unavailable.

### Artist Listing Filters

`GET /api/v1/artist-profiles/` supports optional query parameters:

```
category=<ServiceType>&location=<substring>&sort=<top_rated|most_booked|newest>
```

Profiles include `rating`, `rating_count`, and `is_available` fields. A new
`price_visible` boolean on each artist controls whether the hourly rate is
returned. Newly created profiles default to `true`.

The redesigned listing page features a rounded filter bar wrapped in a white
card with a subtle shadow. Chips use `rounded-full bg-gray-100 text-gray-700
px-3 py-1.5 text-sm` styling and highlight in indigo when selected. The entire
page now rests on a soft gradient background from indigo to white. A new
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
* Unread booking requests are highlighted in indigo so they stand out.
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
Validation errors are now logged server-side and returned as structured JSON so you can quickly debug bad requests.

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

### Payments

```
POST /api/v1/payments
 Required: booking_request_id, amount
 Optional: full (bool)
```
Payment processing now emits structured logs instead of printing to stdout so transactions can be traced in production.

All prices and quotes now default to **South African Rand (ZAR)**. Update your environment or tests if you previously assumed USD values.

`DEFAULT_CURRENCY` in `frontend/src/lib/constants.ts` exports this value for use across the app. Call `formatCurrency(value, currency?, locale?)` from `frontend/src/lib/utils.ts` to format amounts consistently. UI labels such as "Price" and "Hourly Rate" automatically display this currency.

Example usage:

```ts
import { formatCurrency } from '@/lib/utils';

formatCurrency(125); // => 'R 125,00'
formatCurrency(99.5, 'USD', 'en-US'); // => 'US$99.50'
```

---

## Troubleshooting & Common Errors

* **jest: not found**: Run `npm test` in `frontend/` (auto-installs via `pretest`).
* **Missing package.json**: Ensure you’re in `frontend/` before running `npm test` or `npm run lint`.
* **next: not found / ENOTEMPTY**: Reinstall in `frontend/` with `npm install` or `./setup.sh`.
* **Module not found: Can't resolve 'framer-motion'**: Run `npm install` in `frontend/` to pull the latest dependencies.
* **Packages missing after setup**: If you see errors like `next: command not found` or `cannot find module`, `npm ci` likely did not finish. Rerun `./setup.sh` or run `npm ci` inside `frontend/`. When offline, use `scripts/docker-test.sh` to restore dependencies.
* **npm ci fails with `ECONNRESET`**: Check your proxy configuration. Run
  `npm config set proxy http://proxy:8080` and
  `npm config set https-proxy http://proxy:8080` if your environment requires a
  proxy. Without these settings you may see `ENETUNREACH` or other network
  errors when running `setup.sh` or `npm ci`.
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
* **WebSocket closes immediately**: Ensure the booking request exists and that
  your authentication token is valid. Invalid tokens or missing requests cause
  the server to close the connection and log a warning.

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
primary hue is purple (`#7c3aed`), with `brand-dark` and `brand-light` variants.
Components reference these via utility classes such as `bg-brand` and
`bg-brand-dark`.

Update these colors in `frontend/tailwind.config.js` and
`frontend/src/app/globals.css` to adjust the site's look and feel. The Tailwind
config also scans `src/styles/**/*` so constants like `buttonVariants.ts` are
included in the final build. See `frontend/README.md` for detailed theming
instructions.
