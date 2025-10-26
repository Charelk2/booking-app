# Images & Media: Fast, Consistent, and Cacheable

This guide explains how images (avatars, cover photos, portfolio shots, and service media) should be uploaded and rendered so they are:

- Stable public URLs (no expiring links or base64 bloat)
- Optimized by Next.js (`/_next/image`) for responsive sizes and caching
- Consistent across pages (home, category, profile, chat, dashboards)

It also includes the backend alignment (R2 presign endpoints) and a quick checklist to verify everything end‑to‑end.

## TL;DR (Do This Everywhere)

- Use the `SafeImage` component for all app images. It wraps Next/Image with safe defaults.
- Always pass `src` through `getFullImageUrl()` (or `toCanonicalImageUrl()` inside `AppImage`) so keys/relative paths become absolute R2 URLs.
- Uploads should use R2 presigned PUT endpoints and then save the object key (not a presigned GET).
- For local previews (blob:/data:), pass `unoptimized` to avoid trying to optimize temporary URLs.

## Frontend

### Components to Use

- `SafeImage` → preferred for app images, avatars, cards, galleries.
- `Avatar` → renders circular avatars via `SafeImage`.
- `Next/Image` unoptimized → for temporary previews only (blob:/data: or inline base64 during editing).

### Canonical URL Helpers

- `getFullImageUrl()` (frontend/src/lib/utils.ts)
  - Converts known storage mounts to R2 public URLs when `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` is set.
  - Mounts handled: `avatars/`, `cover_photos/`, `portfolio_images/`, `media/`.
  - Also “upgrades” stale `/static/<mount>/…` to R2 form when a public base is configured.
- `toCanonicalImageUrl()` (frontend/src/lib/images.ts)
  - Used internally by `AppImage`/`SafeImage`. Same normalization logic; allows `/api/*` proxies and keeps blob/data previews intact.

### Next.js Configuration (already set up)

- `frontend/next.config.js`
  - `images.remotePatterns` includes your API origin, R2 public host, and optional S3 endpoint host.
  - CSP (`headers()`) whitelists your API + R2 origins in `img-src` and `connect-src`.
  - `images.unoptimized: false` globally to enable Next/Image optimization.

### Where Images Render (examples)

- Category and Home cards: `ServiceProviderCardCompact` → `SafeImage` → Next/Image.
- Profile page (detail): cover + avatar via `getFullImageUrl` then `SafeImage`.
- Dashboard/events hero: `SafeImage` on a chosen `media_url` OR cover/avatar fallback.
- Chat avatars (thread list, headers): `Avatar` → `SafeImage`.
- Service cards (artist services): `SafeImage(getFullImageUrl(service.media_url))`.

### Upload Flows (Option A: R2 Presign)

- Avatar (profile edit): `presignMyAvatar` → PUT to R2 → PATCH with `profile_picture_url = key`.
- Cover (profile edit): `presignMyCoverPhoto` → PUT → PATCH with `cover_photo_url = key`.
- Portfolio (profile edit): `presignMyPortfolioImage` per file → PUT → update order with keys.
- Service media (wizard): `presignServiceMedia` → PUT → set `media_url = key`.

Fallbacks remain (legacy multipart endpoints) and are used only if presign fails, so the UI is resilient.

## Backend

### Presign Endpoints (R2)

- `POST /api/v1/service-provider-profiles/me/avatar/presign`
- `POST /api/v1/service-provider-profiles/me/cover-photo/presign`
- `POST /api/v1/service-provider-profiles/me/portfolio-images/presign`
- `POST /api/v1/services/media/presign`

Each returns a body like:

```
{
  key: "avatars/3/2025/10/uuid.jpg",
  put_url: "https://<r2-endpoint>?X-Amz-Algorithm=...", // short-lived
  public_url: "https://media.booka.co.za/avatars/3/2025/10/uuid.jpg",
  headers: {"Content-Type": "image/jpeg"},
  upload_expires_in: 3600
}
```

- Client PUTs the file to `put_url` with returned headers, then saves the `key` (preferred) on the profile/service.
- On read, the frontend resolves keys to `NEXT_PUBLIC_R2_PUBLIC_BASE_URL/<key>` so Next/Image can optimize it.

### Env/Config Required

- Backend:
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  - `R2_S3_ENDPOINT` (optional), `R2_PUBLIC_BASE_URL` (e.g., `https://media.booka.co.za`)
- Frontend:
  - `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` must match the public base used above.

### Keep These Endpoints As Fallbacks

- Legacy multipart uploads:
  - `POST /api/v1/service-provider-profiles/me/profile-picture`
  - `POST /api/v1/service-provider-profiles/me/cover-photo`
  - `POST /api/v1/service-provider-profiles/me/portfolio-images`
  - `POST /api/v1/uploads/images` (service wizard)

These are still wired and used only when presign fails.

## Best Practices

- Store object keys (e.g., `avatars/3/.../uuid.jpg`) in DB; avoid saving presigned GETs or base64.
- Render via `SafeImage` and pass `getFullImageUrl(keyOrUrl)`.
- Only pass `unoptimized` for temporary blob/data previews.
- Do not gate avatar/cover reads with auth; Next/Image fetches server‑side and won’t send user cookies.
- Ensure your R2 domain is in `images.remotePatterns` and CSP.

## Quick QA

- After upload, Network shows a PUT to `r2.cloudflarestorage.com` (or your custom domain). PATCH profile/service succeeds.
- Visible images request `/_next/image?url=https://media.booka.co.za/<mount>/...` and return 200/304.
- No `/static/avatars` 404s, no CSP errors.

## Common Issues

- Seeing `/static/…` instead of your R2 host
  - Ensure `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` is set.
  - Use `getFullImageUrl()` or `SafeImage` so URLs are upgraded to R2.
- Expiring image links (signatures in query string)
  - Do not persist presigned GETs for avatars/covers; store keys and resolve to public URLs.
- Images 401/403 in prod
  - Make avatars/covers public. Next/Image fetches server‑side without user cookies.

## File Pointers

- Canonicalization: `frontend/src/lib/utils.ts`, `frontend/src/lib/images.ts`
- Components: `frontend/src/components/ui/SafeImage.tsx`, `frontend/src/components/ui/Avatar.tsx`
- Presign API (frontend): `frontend/src/lib/api.ts`
- Presign API (backend): `backend/app/api/v1/api_service_provider.py`, `backend/app/api/api_uploads.py`
- R2 helpers: `backend/app/utils/r2.py`

Follow this pattern when adding new image surfaces (e.g., galleries, service thumbnails) to keep everything fast, consistent, and cacheable.

