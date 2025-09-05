# Service Provider Profiles Performance: What Changed and Why

This document explains the slow-first/fast-later behavior you saw on the service provider list endpoints, the exact code paths involved, and the optimizations implemented to make them consistently fast without breaking response shapes.

## 2025‑09‑05 Updates: Summary & Ops

What we implemented end‑to‑end to stabilize first paint, reduce load, and improve image quality:

- Fast path list (backend): For `fields ⊆ {user_id,id,business_name,profile_picture_url,created_at,updated_at}` the route selects only those columns, paginates in SQL, sorts with `COALESCE(book_count,0) DESC` (SQLite‑safe), groups by artist to avoid duplicates, emits ETag/Cache‑Control, and caches in Redis (keys include normalized `fields`).
- Full path list (backend): Keeps richer joins, adds ETag/304, caches in Redis with `fields` in the key.
- Avatars (backend): New `/api/v1/img/avatar/{id}` proxy crops with LANCZOS and serves WebP/JPEG with `w`, `dpr`, `q`, `fmt` parameters and Redis/edge caching. Lists now default to `?w=256&dpr=2&q=90` for crisp retina cards.
- Frontend (homepage):
  - SSR prefetches only the first section; other rows defer until visible (no thundering herd).
  - Removed bursty list prefetch from the categories carousel; route prefetch remains lightweight.
  - Safety rewrite added: `/static/api/:path* → /api/:path*` so stale bundles still resolve image proxy URLs.
  - Home SSR uses absolute API origin to avoid rewrite drift during ISR.
- Redis (Upstash on Fly):
  - Use TCP on 6379 with TLS disabled: `REDIS_URL=redis://default:<PASSWORD>@fly-booka.upstash.io:6379/0`.
  - Verify from a machine with Python/redis: `r = redis.from_url(os.environ['REDIS_URL']); r.ping()`.
- Fly deploy hygiene: Use rolling deploys and at least two machines (`min_machines_running = 2`) with request‑based concurrency (`type="requests"`). Avoid extra 307s by always calling `/api/v1/service-provider-profiles/` (trailing slash).

Result: homepage lists load reliably; repeated requests HIT cache; avatars are sharp; and bursts no longer tip the API over.

## Symptoms

- Initial requests to list endpoints occasionally return 502/503, then subsequent requests become fast.
- Example URLs affected:
  - `https://api.booka.co.za/api/v1/service-provider-profiles/?category=dj&sort=most_booked&limit=12`
  - `https://api.booka.co.za/api/v1/service-provider-profiles/?category=Dj&page=1&limit=20&fields=id,business_name,profile_picture_url,user.first_name,user.last_name`
  - `https://api.booka.co.za/api/v1/service-provider-profiles/?category=sound_service&sort=most_booked&limit=12`

## What Was Happening

- The “heavy” list endpoint performed a large joined query and materialized all rows in memory (`query.all()`) before applying pagination. Under load or cold cache, that first call could exceed gateway timeouts (502/503).
- The frontend axios client retries idempotent GETs on 502/503/504 with a short backoff. While the first slow query completes and seeds Redis, retries and subsequent requests then hit cache and appear fast.
- Cache keys did not include the `fields` parameter, so differently trimmed payloads could collide in Redis, causing inconsistent shapes between slow and fast responses.
- Category normalization: values like `Dj` are lowercased and underscored to `dj`. Unknown categories return an empty list (expected).
- The lean list path intentionally does not embed nested `user.*` data in list payloads; requesting `fields=user.first_name` does not add the `user` object on that path by design.

## Exact Files Changed (Performance)

- backend/app/api/v1/api_service_provider.py
  - Unified `read_all_service_provider_profiles(...)` route with two code paths:
    - Fast path: when `fields` is a lean subset, select only `{user_id, business_name, profile_picture_url, created_at, updated_at}`, paginate in SQL, group by artist to avoid duplicates, sort with `COALESCE(book_count,0) DESC` (SQLite‑safe), emit ETag/Cache‑Control, and cache in Redis (keys include normalized `fields`).
    - Full path: keep richer joins and optional price histogram, add ETag/304, and cache with `fields` in the key.
  - Rewrote any remaining `query.all()` usages to `count() + offset(limit)` pagination.
  - Rewrote avatar fields in list payloads to a proxy URL (`/api/v1/img/avatar/{id}`) so lists never ship embedded base64 images.

- backend/app/utils/redis_cache.py
  - Cache keys include normalized `fields` to prevent collisions; both fast‑path and full payloads are cached.
  - Added byte helpers used by the avatar proxy.

- backend/app/api/v1/api_images.py (new)
  - High‑quality avatar proxy with center‑crop, LANCZOS resampling, and tunable `w`, `dpr`, `q`, `fmt`; ETag + long Cache‑Control; Redis variant caching.

No response schemas were changed, no migrations were added, and availability/date logic remains intact.

## Frontend Callers (For Reference)

- frontend/src/lib/api.ts → `getServiceProviders(params)` issues GET `/api/v1/service-provider-profiles/` with filters, sort, page, limit, `fields`.
- frontend/src/app/page.tsx (SSR/ISR) prefetches list sections using the same endpoint.
- frontend/src/components/home/ArtistsSection.tsx uses `getServiceProviders(...)` for carousels.
- Axios interceptor in `frontend/src/lib/api.ts` retries idempotent GETs on 502/503/504; this explains duplicate initial requests during cold starts.

## Why This Fix Helps

- SQL-side pagination prevents full-result materialization, shaving query time and memory drastically on first hits.
- Price distribution aggregation avoids scanning the entire joined result set.
- Stable Redis keys remove payload-shape collisions across different `fields` requests.
- Optional cache prewarming reduces or eliminates cold-start spikes for hot categories/sorts.

## How to Verify

- Observe response headers for list calls:
  - `X-Cache: MISS` on the very first request, quickly followed by `X-Cache: HIT` (or a `304 Not Modified` if the client sends `If-None-Match`).
  - `Cache-Control` and `ETag` remain present on cacheable responses.
- Exercise your examples directly and compare time-to-first-byte before/after.

### Verification Checklist (copy/paste)

- Lean fast path (first MISS, then HIT/304):
  - `curl -sS -D - -o /dev/null 'https://api.booka.co.za/api/v1/service-provider-profiles/?category=musician&sort=most_booked&limit=12&fields=id,business_name,profile_picture_url'`
  - Run again within 60s; expect `X-Cache: HIT` (or 304 if your client sends `If-None-Match`).

- Same endpoint with explicit ETag 304 test:
  - First: `curl -sS -D - 'https://api.booka.co.za/api/v1/service-provider-profiles/?category=musician&sort=newest&limit=12&fields=id,business_name,profile_picture_url' -o /dev/null`
  - Copy the `ETag` value from the headers, then:
  - `curl -sS -D - -H 'If-None-Match: W/"<PASTE-ETAG-HERE>"' 'https://api.booka.co.za/api/v1/service-provider-profiles/?category=musician&sort=newest&limit=12&fields=id,business_name,profile_picture_url' -o /dev/null`
  - Expect: `HTTP/2 304` with no body.

- Heavy fields (cached too; expect MISS then HIT/304):
  - `curl -sS -D - -o /dev/null 'https://api.booka.co.za/api/v1/service-provider-profiles/?category=photographer&sort=most_booked&limit=12&fields=id,business_name,profile_picture_url,custom_subtitle,hourly_rate,price_visible,rating,rating_count,location,service_categories,user.first_name,user.last_name'`
  - Run again within 60s; expect cache engagement.

- Avatar proxy (HTTP 200 with ETag; 304 on revalidate):
  - `curl -I 'https://api.booka.co.za/api/v1/img/avatar/123?w=256&dpr=2&q=90'` (replace 123 with a real artist id)
  - Expect: `Content-Type: image/webp` (or jpeg), `Cache-Control: public, s-maxage=...`, `ETag: ...`

- Redis connectivity (inside a Fly machine):
  - `flyctl ssh console -a <app>` then:
  - `python - <<'PY'
import os, redis
url=os.environ.get('REDIS_URL'); print('REDIS_URL=', url)
r=redis.from_url(url); print('PING =>', r.ping())
PY`
  - Expect: `PING => True`.

## Operating Notes (Postgres-focused)

- These code changes are database-agnostic and safe. For best performance in Postgres:
  - Ensure indexes exist to support common filters/sorts: `Service(artist_id, status)`, `Service(service_category_id, status)`, `Service(artist_id, price)`, `Review(artist_id)`, `Booking(artist_id, status)`, `Artist(created_at)`, `Artist(updated_at)`, and a functional index on `lower(ServiceCategory.name)`.
  - If `location ILIKE '%…%'` is common, enable `pg_trgm` and add a trigram GIN index on `Artist.location` for substring search.
  - For very large datasets, consider denormalized columns (e.g., `book_count`, `rating_avg`, `rating_count`) maintained by triggers or jobs so `sort=most_booked/top_rated` become index-friendly reads.

## Prewarming (Optional)

- You can prewarm hot caches after deploys to avoid cold-start latencies:
  - `API_BASE=https://api.booka.co.za python scripts/prewarm_artists.py`
  - The script reports status codes and timings per category/sort.

## Frontend Networking (Notes)

- Ensure the frontend calls the API host directly using the correct base URL (e.g., `NEXT_PUBLIC_API_URL=https://api.booka.co.za`).
- Avoid adding redirects that bounce API calls between origins; they can introduce CORS preflights or break credentials on error paths.

---

## Deep Dive: Why It Feels Instant Now

This section explains the problem in plain language and what changed.

- Before: The first request after a lull hit a “cold path” — a big database query that loaded all matching rows, then paginated in Python, and sometimes an idle database connection had been closed by the database or proxy. That first request could time out at the gateway (502/503), and occasional cross‑origin redirects could complicate CORS. After the first heavy query finally finished, Redis had a warm cache and everything felt fast.
- After: The frontend calls the API host directly (no extra redirect). On the backend, queries paginate in SQL (no full materialization), price distributions use targeted aggregations, and the DB connection pool validates connections before use. Result: the “first hit” is much cheaper and doesn’t fail; subsequent hits are warmed by Redis and are instant.

How to think about the request flow now:
- Browser → Backend API → Redis/Postgres → Browser.
- If Redis has the entry, it’s returned immediately. If not, Postgres runs a query that’s constrained and paginated server‑side. Either way, the response carries cache headers so future requests reuse it. The DB engine pre‑pings connections to avoid stale links after inactivity.

Key lessons captured in code:
- Do pagination in the database, not in application memory.
- Keep cache keys faithful to the payload shape (include `fields`).
- Avoid cross‑origin redirects for API calls; ensure CORS is correct on every response path (including errors).
- Validate and recycle DB connections to avoid first‑hit failures after idle periods.

## Is The Code Well Structured?

Short answer: yes, with a few areas to continue tightening as traffic grows.

Strengths:
- Clear separation of concerns: list endpoints live under `api_service_provider.py`; caching helpers live under `utils/redis_cache.py`; frontend requests are centralized in `frontend/src/lib/api.ts`.
- Caching is applied where it matters (artist lists, availability, weather) with stable headers and Redis keys.
- CORS is handled consistently at the API, including error responses.

Opportunities:
- Unify “heavy” and “lean” list code paths behind shared helpers to reduce duplication and ensure sorting/filtering logic stays consistent.
- Document and constrain `fields` more clearly (top‑level only on list endpoints) to avoid confusion and payload bloat.
- Keep image payload hygiene centralized (e.g., one place that scrubs or rewrites large data‑URLs for list views).
- Introduce single‑flight protection in the cache layer for identical in‑flight misses to avoid thundering herds.
- Extend integration tests for cold‑start behavior (first request after idle) and for CORS regressions.

## Scaling Blueprint (100k DAU)

This platform blends booking workflows, real‑time chat, notifications, and media uploads. Below is a pragmatic, future‑proof plan that builds on your current stack.

### What’s Right (Keep)

- DB first: Managed Postgres + pgBouncer, strict timeouts, read replicas for analytics.
- Caching strategy: Redis with single‑flight (dogpile prevention) + TTL jitter.
- Media pipeline: Direct‑to‑storage with managed transcoding (Mux/Cloudflare Stream).
- Next.js delivery: ISR for lists, staggered fetches.
- Realtime: Clear Option A (managed) vs Option B (DIY with Redis pub/sub).
- Ops & reliability: Outbox pattern, blue/green or canary, DR snapshots, tracing/metrics/logging with correlation IDs.
- Security: Cookie auth across subdomain, rate limits at edge and app.
- Bottom line: This foundation will scale and stay maintainable.

### Gaps & Risks (and Fixes)

1) Double‑booking & availability integrity
- Risk: Race conditions around acceptance/checkout can create overbookings.
- Fix: Use row‑level or advisory locks. Keep an availability table keyed by `(provider_id, date, slot)` with a unique constraint and perform booking in a single transaction (insert → commit) so it fails atomically if already taken. Consider SERIALIZABLE only for this path (or READ COMMITTED + explicit locks).

2) Search & geo queries
- Risk: Slow “near me / filter” queries under load.
- Fix (now): PostGIS for lat/long + GiST/BRIN indexes; `tsvector` for text; `pg_trgm` for ILIKE. Precompute sortable fields (book_count, rating_avg).
- Fix (later): External search (Meilisearch/OpenSearch) if facets + typo‑tolerance grow.

3) Indexes: add covering + partial
- Add practical indexes tied to query shapes: `booking (artist_id, event_date DESC) WHERE status IN ('pending','confirmed')`, `service (service_category_id, status, price)`, `review (artist_id, created_at DESC)`, `artist (status, updated_at DESC)` partial on `status='active'`, `lower(name)` functional + `tsvector(name,tags,city)`.

4) pgBouncer mode & prepared statements
- Risk: Transaction pooling + server‑side prepared statements cause errors/timeouts.
- Fix: Disable server‑side prepare or use session pooling; keep app `pool_pre_ping` and size pools within pgBouncer limits.

5) Queue durability
- Risk: Redis broker can drop tasks on failover.
- Fix: Use SQS/RabbitMQ/Kafka for critical tasks; keep Redis for cache/pubsub. For Celery: broker=SQS/RabbitMQ, result backend=Redis/Postgres. Keep Outbox as source of truth; workers idempotent.

6) Realtime at scale
- Risk: Fan‑out and mobile background delivery get hard in DIY mode.
- Fix: Start DIY (WS + Redis adapter), with a cutover plan to Ably/Pusher when rooms >50k, devices highly mobile, or cross‑region fanout is painful. Client message IDs for de‑dupe, acks/receipts, batch typing (≤1/s). Backpressure: drop oldest presence/typing updates (never messages).

7) Payments hardening
- Risk: Duplicate charges and webhook races.
- Fix: Idempotency keys on create‑payment. Verify/sign webhooks, persist event, process via worker (Outbox → Handler) idempotently. Track `payment_attempts` with audit trail.

8) Media cost & UX
- Risk: Egress cost + slow first paints for heavy media.
- Fix: Cloudflare Images or Next/Image with edge caching; Cloudflare Stream/Mux with device‑based caps; lifecycle + cold tiers; direct client uploads with strict limits and scanning.

9) Observability — make it actionable
- Add golden signals + budgets: p95 list/search 400–600ms, chat send→deliver <200ms, quote actions <800ms. Alert on SLO burn. Trace sampling (~10%). Log redaction for PII.

10) Migrations without drama
- Fix: Expand–migrate–contract strategy; online/backfilled migrations; throttle; try on a replica first.

11) Data lifecycle & analytics
- Retention for chat/media/system logs. Ship events to a warehouse (BigQuery/Redshift) via CDC (Debezium/Fivetran); don’t run heavy reports on prod.

12) Compliance & ZA reality
- POPIA/GDPR basics: purpose limitation, delete/export flows, encrypt sensitive PII, strict bucket ACLs. Choose regions close to ZA users; Cloudflare helps, but API latency still matters.

### Architecture Outline

- Data: Managed Postgres (+pgBouncer, statement timeouts, replicas) and Redis (cache, single‑flight, presence/rate limits).
- API: FastAPI modular monolith; SQL pagination; strict field trimming; image payload hygiene; heavy/CPU/blocking tasks offloaded to workers.
- Workers: Celery/Dramatiq/RQ on durable broker; Outbox pattern for reliability.
- Realtime: DIY WS + Redis adapter; define cutover to managed fan‑out if growth demands.
- Media: Direct‑to‑storage uploads; managed transcoding and CDN delivery; webhooks update asset state.
- Frontend: Next.js ISR + SWR; SSR prefetch for featured lists; stagger client fetches. React Native with push + deep links.
- Edge/CDN: Cloudflare caching (stale‑while‑revalidate), WAF for auth/payment routes, WS pass‑through. Avoid redirects for `/api` endpoints.
- Observability: OTel traces across Next → API → workers; correlation IDs; dashboards for p95; Redis hit/miss; DB pool metrics.
- Security: Cookie auth (`SameSite=None; Secure; Domain=.booka.co.za`), edge/app rate limits; CSRF on non‑idempotent forms; secrets rotation; least‑privilege IAM.

### Small, High‑Leverage Tweaks

- Time budgets: enforce server‑side timeouts and client cancellation.
- Counters: prefer append‑only events + periodic aggregation vs triggers if write load rises.
- Caching: implement single‑flight via short lock keys; version cache keys (e.g., `v2:list:...`).
- WebSockets: align keepalives/timeouts across Cloudflare and Fly; client heartbeats.

### Phased Plan

- Next 2 weeks: Managed Postgres + pgBouncer + indexes + timeouts; direct‑to‑storage uploads + transcoder; idempotent payments/webhooks via Outbox; single‑flight caching on hot lists + ISR; booking integrity locks.
- Next 4–6 weeks: Durable broker for workers; PostGIS + text search; OTel dashboards + SLO alerts; keep DIY WS but spike Pusher/Ably adapter behind an interface.
- Next 2–3 months: CDC to warehouse; chaos‑lite drills (DB failover, cache outage, broker blips); evaluate region expansion as global demand grows.

### Bottom Line

The current stack (React Native, Next.js, FastAPI, Postgres, Redis, Cloudflare, Fly/Vercel) is a future‑proof path to 100k DAU. The critical additions are transactional booking locks, richer indexes/search, durable queues for critical tasks, a clear realtime cutover plan, and SLOs.

## Capacity & Cost: Vercel Pro Quick Math

Short take: On Vercel Pro ($20/mo) with your API on Fly.io, you’re typically good for ~4k–8k DAU inside included quotas—more if you offload images and cache hard. With light overages, ~10k–12k DAU is still reasonable.

Why (quick math)
- Pro includes ~10M edge requests + 1TB transfer per month.
- With ~4 pageviews/user:

| Build profile | Requests / PV | Transfer / PV | DAU inside ~included | Notes |
| --- | ---: | ---: | ---: | --- |
| Lean (images on R2/Cloudflare, good caching) | ~10 | ~0.6 MB | ~8k DAU | Requests become the limiter before bandwidth |
| Typical (modern Next.js app, some images, code‑split) | ~14 | ~1.2 MB | ~6k DAU | Requests & bandwidth are close; both fit |
| Heavy (bigger bundles, more images from Vercel) | ~20 | ~2.0 MB | ~4k DAU | Both caps hit sooner |

Formula you can reuse:
- DAU ≈ min( (10M / 30) ÷ (PV/user × req/PV), (1TB / 30) ÷ (PV/user × MB/PV) )

What if you get more traffic?
- Overages are cheap and linear: +$2 per extra 1M requests, +$0.15/GB.
- Example (typical profile, 10k DAU): ~16.8M requests & ~1.4TB/mo → about $70–$75 overages + $20 base ≈ ~$90–$110/mo.

How to push toward 10–20k DAU cheaply
- Cache hard: ISR for listing/profile pages; long Cache‑Control on static assets.
- Offload media: serve user images/video via Cloudflare Images/R2 (or similar).
- Keep bundles tight: split routes, defer non‑critical JS, compress (gzip/br).
- Pre‑size images with `<Image>` and correct `sizes` to avoid bandwidth waste.

Bottom line: Vercel Pro is fine. Expect ~4–8k DAU within plan, and ~10–12k DAU with modest overages and good caching/media offload.
