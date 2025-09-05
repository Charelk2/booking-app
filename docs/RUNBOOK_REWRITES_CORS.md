# Runbook: Fix 502/503 + CORS from `/api` requests

This runbook explains how to eliminate browser CORS errors and transient 502/503s seen when the frontend calls `/api/...`.

## Root Cause

- A redirect exists from `https://booka.co.za/api/...` to `https://api.booka.co.za/api/...`.
- Redirects turn same-origin fetches into cross-origin, so browsers enforce CORS.
- Gateway/edge 5xx responses (502/503) often do not include CORS headers, so the browser reports a CORS error instead of the original status.
- Our code already uses relative `/api/...` with Next.js rewrites (no CORS). The redirect is a platform config issue.

## The Fix (Do This)

1) Remove redirect rules for `/api/*`

- Vercel Dashboard → Project → Settings → Redirects:
  - Delete any rule like: `Source: /api/(.*)` → `https://api.booka.co.za/api/$1` (308/307).
  - Do not implement `/api` as a redirect.

- Cloudflare (if used):
  - Bulk Redirects / Page Rules / Transform Rules: remove any redirect from `/api/*` to `api.booka.co.za`.

- Nginx (if used): replace redirect with proxy:
  ```nginx
  # BAD (causes cross-origin CORS):
  # return 308 https://api.booka.co.za$request_uri;

  # GOOD (rewrite/proxy, stays same-origin):
  location /api/ {
    proxy_pass https://api.booka.co.za;
    proxy_http_version 1.1;
    proxy_set_header Host api.booka.co.za;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_redirect off;
  }
  # WebSocket upgrades (if applicable)
  location /api/v1/ws/ {
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass https://api.booka.co.za;
  }
  ```

2) Keep using Next.js rewrites (already in repo)

- `frontend/next.config.js` defines internal rewrites:
  - `/api/:path* → ${apiBase}/api/:path*`
  - `/auth/:path* → ${apiBase}/auth/:path*`
  - `/static/:path* → ${apiBase}/static/:path*`
- These are proxy rewrites, not redirects; the browser sees a same-origin response, avoiding CORS entirely.

3) Optional: Add CORS headers on gateway errors

If cross-origin calls are unavoidable in some contexts, configure your gateway (Cloudflare/Vercel/NGINX) to add:

- `Access-Control-Allow-Origin: https://booka.co.za`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, Content-Type, X-Device-Id`

Note: The backend (FastAPI) already sets CORS consistently on app responses, including exceptions.

## Verify

Run the provided script (requires curl):

```bash
./scripts/ops/check-api-rewrites.sh
```

You want:

- No `Location:` header on `https://booka.co.za/api/...` (means no redirect).
- Optional: `Access-Control-Allow-Origin` present on direct `https://api.booka.co.za/api/...` when sent with `Origin: https://booka.co.za`.

## Reduce 502/503 frequency

- Fly.io: in `fly.toml` set `min_machines_running = 2` and use request concurrency (`type = "requests"`).
- Warm caches post-deploy:
  ```bash
  API_BASE=https://api.booka.co.za python scripts/prewarm_artists.py
  ```
- The codebase already includes Redis caching and a fast-path for provider lists (see `README_PERFORMANCE.md`).

