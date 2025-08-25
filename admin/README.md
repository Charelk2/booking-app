# Booka Admin Console

Production-ready React Admin console for operations: Listings moderation, Bookings lifecycle, Ledger, Payouts (incl. batch creation), Resolution Center (Disputes), Email/SMS event logs, Reviews, Audit log, and Admin Users.

## Quick start

- Prereq: Node 18+ and npm.
- Copy env: `cp .env.example .env` and edit if needed.
- Dev: `npm i && npm run dev`
- Build: `npm run build && npm run preview`

The app auto-detects API base if `VITE_API_URL` is not set:
- Hosts ending with `booka.co.za` → `https://api.booka.co.za/admin`
- Otherwise → `http://<hostname>:8000/admin` (localhost default)

You can override explicitly via `.env`:
```
VITE_API_URL=https://api.booka.co.za/admin
VITE_ADMIN_TITLE=Booka Admin
```

## Expected backend endpoints

Auth:
- `POST /admin/auth/login` → `{ token, user }`
- `GET /admin/auth/me` (JWT)
- `POST /admin/auth/logout` (optional)

CRUD resources (React Admin defaults):
- `GET /admin/<resource>?_page=&_perPage=&_sort=&_order=&...` → `[{..}]` with `X-Total-Count`
- `GET /admin/<resource>/:id` → `{...}`
- `PUT /admin/<resource>/:id` → `{...}` (e.g., `admin_users` edits)

Custom actions used:
- `POST /admin/listings/:id/approve`
- `POST /admin/listings/:id/reject` `{ reason? }`
- `POST /admin/bookings/:id/complete`
- `POST /admin/bookings/:id/refund` `{ amount }`
- `POST /admin/payout_batches` `{ bookingIds: [] }`

Resources expected by UI:
- `listings`, `bookings`, `ledger`, `payouts`, `disputes`, `email_events`, `sms_events`, `reviews`, `audit_events`, `admin_users`

## Hosting

- Local dev: http://localhost:5173
- Local preview (prod build): http://localhost:5174
- Production: serve the `admin/dist` folder behind `https://booka.co.za/admin/` (static hosting or CDN). The app will call `https://api.booka.co.za/admin` if hosted under booka.co.za.

Nginx example (static + API on separate host):
```
location /admin/ {
  alias /srv/booka-admin/; # dist contents
  try_files $uri /index.html;
}
proxy_set_header Authorization $http_authorization;
```

Security notes:
- Enforce RBAC server-side; UI-only restrictions are not sufficient.
- Add 2FA for admin accounts and IP allowlisting or rate-limiting on `/admin/*`.
- Log all admin mutations in an `audit_events` table.

## Customize
- Tweak endpoints in `src/dataProvider.ts`.
- Adjust menu in `src/layout/Menu.tsx`.
- Add resource pages in `src/resources/*` and custom flows in `src/routes/*`.

