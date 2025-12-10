Image Optimization, Caching, and Cloudflare Switch Guide

Overview
- Next.js Image Optimizer enabled (global): delivers responsive, cached derivatives.
- SafeImage wrapper: robust `next/image` wrapper that
  - normalizes backend and (future) Cloudflare Images URLs/IDs,
  - auto-falls back on errors,
  - auto-sets `unoptimized` for `data:`/`blob:` sources to avoid runtime optimizer errors.
- Cloudflare groundwork in place: helper + optional loader toggle.
- Upload-first flow: new or edited service media are uploaded via multipart and stored as stable URLs (R2 keys or `/static/...` paths).
- Migrations: one-click POST endpoints to convert legacy inline media to static file URLs.
- LCP and UX polish: hero images prioritized, blur placeholders on key images, subtle route progress bar, skeleton UIs, Safari-gated prefetch, and cache-based prefetch for category clicks.
 - LCP and UX polish: hero images prioritized, blur placeholders on key images, subtle route progress bar, skeleton UIs, Safari‑gated prefetch (1s post‑load), and cache‑based prefetch for category clicks.

Key Files
- Frontend
  - `src/components/ui/SafeImage.tsx`: the canonical image component.
  - `src/lib/cfImage.ts`: Cloudflare Images URL/ID helpers.
  - `src/lib/cfLoader.ts`: optional Cloudflare Images loader (toggleable).
  - `next.config.js`: remotePatterns, optimizer settings, and rewrites.
  - `src/components/home/CategoriesCarousel.tsx`: fallback list, LCP tags, idle prefetch with Safari gating.
  - `src/hooks/useServiceCategories.ts`: module-seeded fallback and API swap-in.
  - `src/lib/api.ts`: providers cache + prefetch helpers.
  - `src/app/service-providers/page.tsx`: uses cache-first render, limits fields for faster payloads.
  - `src/app/service-providers/[id]/page.tsx`: LCP hero, blur placeholders, fade-in.
  - `src/app/service-providers/[id]/loading.tsx`: skeletons aligned to desktop/mobile layout.
- Backend
  - `backend/app/api/api_uploads.py`: `POST /api/v1/uploads/images` for generic image uploads, returns `/static/portfolio_images/...` URLs.
  - `backend/app/api/api_ops.py`:
    - `POST /api/v1/ops/migrate-service-media-to-files` (convert older inline media to file-backed URLs)
    - `POST /api/v1/ops/migrate-profile-images-to-files` (users/profile pics, cover photos, portfolio arrays → file-backed URLs)
  - `backend/app/services/avatar_service.py` + `backend/app/api/api_user.py`:
    - `/api/v1/users/me/profile-picture` stores avatars via a shared helper:
      - Prefer Cloudflare R2 under `avatars/{user_id}/...` when `R2_*` is configured.
      - Fall back to `/static/profile_pics/...` when R2 is not available.
      - New uploads no longer persist `data:` URLs; legacy data URLs remain supported by the image pipeline.
  - `backend/app/main.py`: mounts uploads router, serves `/favicon.ico` to avoid 404 noise.

What We Implemented (Summary)
1) Enabled Next/Image optimizer globally; guarded previews with `unoptimized` where needed.
2) Standardized image usage to `SafeImage` across key components (avatars/cards/covers/heroes).
3) Added Cloudflare support scaffolding: cf helpers + optional loader.
4) Switched add-service flow to upload-first (multipart) so service and profile media are stored as R2/static URLs.
5) Added ops migrations to convert older inline media to file-backed URLs when needed.
6) Improved LCP & UX:
   - `priority + fetchPriority="high" + elementtiming="LCP-hero"` on true heroes.
   - Blur placeholders on heroes and cards.
   - Route progress bar (2px) with delay to avoid flashing.
   - Responsive skeletons on category and provider pages.
   - Safari-gated idle prefetch and robust category fallbacks.
   - Safari first‑load guard: On the homepage, prefetch is deferred until after the window 'load' event + 1000ms and runs only once per session (key: `home:prefetch-done`). This prevents first‑paint hang on Safari while preserving speed thereafter.
7) Stopped message polling when logged out (no 401 spam, less work).

How to Switch to Cloudflare Images (Step‑by‑Step)
Prereqs
- You have Cloudflare Images enabled and know your Account Hash.
- (Optional) You have a custom domain for Images (e.g., `images.example.com`).

Env Vars (Frontend)
- Set in `frontend/.env.production` (or Vercel/Fly env panel):
  - `NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH=<your_account_hash>`
  - `NEXT_PUBLIC_CF_IMAGES_VARIANT=public` (or a variant name you’ve created)
  - `NEXT_PUBLIC_CF_IMAGES_DOMAIN=<optional_custom_domain>`
  - `NEXT_PUBLIC_CF_IMAGE_LOADER=1` (enables the Next/Image Cloudflare loader)

What the Loader Does
- For recognized Cloudflare Images URLs/IDs (`imagedelivery.net/<hash>/<id>/<variant>`) it appends width/quality hints (e.g., `?width=…&quality=…`) so Next can generate srcsets via Cloudflare.
- The `SafeImage` component auto-applies the loader when `NEXT_PUBLIC_CF_IMAGE_LOADER=1`.

Serving New Uploads via Cloudflare (Options)
Option A: Keep uploading to backend, then migrate URLs to CF lazily later.
- Pros: zero backend changes now; switch delivery source later by rewriting URLs.
- Cons: images still originate from your backend until you migrate.

Option B: Upload directly to Cloudflare Images from the frontend/backend.
- Frontend (recommended):
  - Use a signed URL or direct upload endpoint from Cloudflare.
  - Store the returned `image_id` (and/or full delivery URL with variant) in your DB.
  - `SafeImage` will render those Cloudflare IDs/URLs immediately (with the loader enabled).
- Backend proxy: optionally accept the upload and forward to Cloudflare from the server.

Migration Plan (Backend → Cloudflare) if using Option A
1) Identify images hosted at your backend (`/static/...`).
2) For each, upload the bytes to Cloudflare Images using their API.
3) Store the resulting `image_id` (or variant URL) back into your DB.
4) Update frontend to use those IDs/URLs (no code change required if you store the URL).
5) Enable the loader (`NEXT_PUBLIC_CF_IMAGE_LOADER=1`).

Toggle Plan (Runtime)
- To keep rollout safe, the loader is disabled by default. Turning it on with `NEXT_PUBLIC_CF_IMAGE_LOADER=1` will route next/image through the Cloudflare loader only for Cloudflare sources; backend-hosted images continue through the regular optimizer.

Deploy Checklist (Fly.io or similar)
Frontend
- `NEXT_PUBLIC_API_URL=https://api.booka.co.za` (or your API base) to proxy/optimize against production.
- Optional CF vars (above) to enable loader.

Backend
- Persist uploads across restarts: attach a volume and set `UPLOADS_DIR` (and/or `ATTACHMENTS_DIR`). The app symlinks `/static` subfolders accordingly.
- Run migrations (once):
  - POST `/api/v1/ops/migrate-service-media-to-files`
  - POST `/api/v1/ops/migrate-profile-images-to-files`

Smoke Tests
- Load provider pages with old and new images: avatars, covers, gallery, and service images.
- Verify category pages: quick render (fallback) then real data swap; images optimized.
- Try uploading a new service image: verify it persists and renders via Next optimizer.
- Verify Safari: carousel paints immediately; prefetch starts after load; no throbber hang.
  - Note: We gate prefetch on Safari by waiting 1000ms after 'load' and using a per‑session flag; adjust the delay in `components/home/CategoriesCarousel.tsx` if needed.

Troubleshooting Safari
- Symptom: On the first ever visit, the homepage appears to “hang” until a manual refresh; subsequent loads are fine.
- Current mitigation: On Safari, homepage prefetch is deferred until after the `load` event + 1000ms and only runs once per session (`sessionStorage` key: `home:prefetch-done`). This prevents first‑paint hangs while preserving speed thereafter.
- Escalation options (pick one):
  - Increase the delay further (e.g., 1500–2000ms) in `components/home/CategoriesCarousel.tsx` where the post‑load `setTimeout` runs.
  - Disable first‑session prefetch entirely on Safari:
    - Quick switch: At the top of the Safari branch in the prefetch `useEffect`, short‑circuit and return if `!sessionStorage.getItem('home:prefetch-done')`.
    - Env‑guarded (recommended):
      ```ts
      // components/home/CategoriesCarousel.tsx
      const DISABLE_SAFARI_FIRST_SESSION_PREFETCH = String(process.env.NEXT_PUBLIC_DISABLE_SAFARI_FIRST_SESSION_PREFETCH || '') === '1';
      if (isSafari && DISABLE_SAFARI_FIRST_SESSION_PREFETCH && typeof sessionStorage !== 'undefined') {
        if (!sessionStorage.getItem('home:prefetch-done')) return; // skip entirely on first session visit
      }
      ```
      Then set `NEXT_PUBLIC_DISABLE_SAFARI_FIRST_SESSION_PREFETCH=1` in the frontend environment.
  - As a last resort, disable homepage prefetch on Safari always:
    ```ts
    if (isSafari) return; // do not prefetch on Safari
    ```
- Notes:
  - Older iOS Safari versions are more sensitive to prefetch before first paint. Prefer deferring until after `load` + a small delay.
  - Keep the local category fallback seeded so the carousel always renders instantly, regardless of API timing or prefetch.

RUM (Optional)
- You can instrument `elementtiming="LCP-hero"` via a `PerformanceObserver` to report hero paint times:
  - Observe type `element` and filter entries with `identifier === 'LCP-hero'`.
  - Send to your analytics for real user LCP.

Notes & Defaults
- Blob/data previews remain `unoptimized` so uploads & crops stay instant.
- If you want super-aggressive payload reduction on list pages, adjust `fields` queries further in `getServiceProviders` callers.
- Google OAuth / One Tap login will, when enabled (`GOOGLE_AVATAR_SYNC_ENABLED=1`), best‑effort copy the user's Google `picture` into the same avatar pipeline (R2 or `/static/profile_pics`). It only seeds avatars for accounts that do not yet have a `profile_picture_url` and never overwrites a user‑chosen image; failures are non‑fatal and login still succeeds.
