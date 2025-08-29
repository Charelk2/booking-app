Scale Readiness and Growth Playbook

Purpose
- Concrete, phased checklist to keep performance, reliability, and costs predictable as traffic grows toward 100k+ daily users.
- Tailored to the current stack: Frontend on Vercel, Backend on Fly.io, Redis caching, planned Postgres, optional Cloudflare Images/CDN.
- Living document — update as we change architecture.

Scope
- Speed (TTFB/LCP), resiliency (cache/DB/WS), and operability (observability, rollout, runbooks).
- No source code here; this is a guidance checklist. See AGENTS.md for feature-level details.

Postgres Migration Playbook
Overview
- Goal: Move backend from SQLite-on-volume to managed Postgres for better concurrency, reliability, and operational tooling.
- Rollout: Prefer a short maintenance window with a verified backup and easy rollback. For zero/low-downtime, use read-only freeze + cutover.

Prereqs
- Provision a managed Postgres in the same region as the API (e.g., Fly Postgres, Neon, RDS, Supabase). Capture:
  - Host, Port, Database, User, Password
  - Connection string example (SQLAlchemy): `postgresql+psycopg://USER:PASSWORD@HOST:PORT/DBNAME`
- Backend image includes a Postgres driver (psycopg). If not, build with `psycopg` in requirements.
- Fly.io CLI installed and authenticated; access to app’s Fly organization.

Connection Settings
- Environment (Fly secrets preferred):
  - `SQLALCHEMY_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DBNAME`
  - Keep `REDIS_URL` set.
- Pooling (when code adds it):
  - Set sensible pool size and timeouts (e.g., pool_size 5–10 per instance, pool_timeout 5–10s).
- SSL:
  - Use `?sslmode=require` if provider mandates TLS. Example: `.../DBNAME?sslmode=require`.

Data Migration (SQLite → Postgres)
Option A — Maintenance Window (simplest)
1) Freeze writes: put the app in maintenance/read-only for 10–30 minutes.
2) Backup SQLite volume: snapshot or copy `/data/booking.db` off the machine.
3) Migrate schema: run Alembic migrations against Postgres:
   - `flyctl ssh console -C "cd /app && alembic upgrade head"`
   - If Alembic isn’t configured for Postgres types yet, generate a migration in a branch beforehand.
4) Move data:
   - Small DB: write a one-off script (or DBeaver) to copy tables from SQLite to Postgres.
   - Alternative: use `sqlite3 .dump` → transform → `psql` (be mindful of type differences and foreign keys).
5) Point app to Postgres:
   - `flyctl secrets set SQLALCHEMY_DATABASE_URL=postgresql+psycopg://...`
   - Deploy/restart app.
6) Verify:
   - Smoke tests: healthz, login, homepage list, provider details, uploads.
   - Rollback window: keep SQLite state frozen until signoff.

Option B — Dry Run Then Cutover
1) Create a staging Postgres and load a sanitized copy of data from SQLite.
2) Run test suite and manual smoke against staging.
3) On cutover day, follow Option A with reduced risk (playbook rehearsed).

Type/Query Differences
- Aggregations: SQLite `group_concat` ≈ Postgres `string_agg`.
- Booleans/datetimes: Ensure correct DDL types via Alembic before moving data.
- Pagination: Use `ORDER BY ... LIMIT/OFFSET` in SQL, not in Python.

Indexing (Postcutover)
- Create indexes aligned to hot paths:
  - Services: `(artist_id)`, `(service_category_id)`, `(status)`; composite where necessary.
  - Profiles: `(created_at)`, `(location)` if filtered; text search indices if needed.
  - Bookings: `(artist_id, status)`, timestamps for recency.
- Enable slow-query logging and capture top offenders; tune iteratively.

Rollback Plan
- Before cutover: take a full copy of `/data/booking.db` and store securely.
- Keep the previous deployment image/VM alive (scaled to 0) for quick re-run if needed.
- To rollback:
  1) Set `SQLALCHEMY_DATABASE_URL` back to the SQLite DSN (e.g., `sqlite:////data/booking.db`).
  2) Redeploy backend; confirm health.
  3) Investigate Postgres issues offline (migrations, types, indexes), then retry cutover.
- Data divergence:
  - If you allowed writes during a failed cutover, reconcile diffs manually (avoid this by freezing writes during maintenance).

Validation & Signoff
- Run smoke tests (homepage list TTFB, provider profile, auth flows, uploads).
- Confirm Redis caching HITs for list and availability.
- Monitor error rate and p95 latencies for 24–48h; rollback if budgets are violated.


Key Targets (Default Budgets)
- LCP p75: <= 2.5s on homepage and provider list in primary region.
- TTFB p75: <= 400ms for cached list responses.
- Error rate: < 0.1% (5xx) sustained; spikes resolved < 30m.
- Uptime: 99.9% monthly SLO for core read paths.

Current Stack (Baseline)
- Frontend: Next.js on Vercel (with next/image). PWA enabled. Client fetch + some SSR.
- Backend: FastAPI on Fly.io, SQLite default (migration to Postgres planned), Redis caching utilities present.
- Images: Next.js optimizer; Cloudflare Images scaffolding in code; CDN not yet in place.
- Realtime: WebSockets for chat via backend service.

Phased Checklist

Phase 0 — Immediate Hygiene (Now)
- Redis
  - Set `REDIS_URL` in Fly secrets (`flyctl secrets set REDIS_URL=...`).
  - Verify connectivity and absence of “Redis unavailable” warnings in logs.
  - Validate keys populate: `service_provider_profiles:list:*`, `availability:*`.
- List Caching Path
  - Ensure homepage/category list requests do NOT include `include_price_distribution=true` and do NOT set `when`. This enables Redis caching on the hot path.
  - Fetch price histogram lazily or via a separate request.
- Images
  - Confirm no `data:` URLs in production DB (run ops migrations if needed).
  - Verify `/_next/image` responses include cache headers and are returning quickly on repeat views.
- Regions
  - Place Fly app in user-near region (e.g., `jnb`) and verify Vercel site is also routing users near ZA.
- Observability
  - Turn on RUM for LCP/TTFB (e.g., Vercel Analytics / custom RUM). Track homepage and provider list.
  - Capture cache HIT/MISS counters in logs for artist list and availability; alert when MISS ratio spikes.

Phase 1 — Data & Queries (Pre-10k/day)
- Database Migration
  - Move from SQLite to managed Postgres (regional to users). Use Fly Postgres or a managed provider.
  - Create indexes for hot filters/sorts:
    - `service.artist_id`, `service.service_category_id`, `service.status`.
    - `service_provider_profile.created_at` (newest sort), `service_provider_profile.location` (if filtering).
    - `review.artist_id`, `booking.artist_id`, `booking.status`.
  - Migrate any SQLite-specific SQL (e.g., `group_concat`) to Postgres equivalents (e.g., `string_agg`) if/when code is updated.
- Provider List Endpoint
  - Avoid full-table materialization (`query.all()` then slicing). Return paginated SQL (`ORDER BY ... LIMIT ... OFFSET ...`).
  - Precompute/cache price histograms per category/price band or compute via a dedicated fast path.
  - Reduce per-row work: do not compute availability in a loop for list pages; fetch availability in bulk or return a quick “is_available” using a precomputed cache.
- Availability
  - Ensure Redis TTL (5–10 min) for availability lookups; avoid recomputation on every list request.
  - Consider day-scoped keys (e.g., `availability:<artist_id>:YYYY-MM-DD`).
- Payload Trimming
  - Ensure list endpoints only return card fields (id, name, image, rating, price, location, categories). Defer heavy fields to detail pages.

Phase 2 — Caching & Media (10k–50k/day)
- Redis Hardening
  - Production Redis with sufficient memory, `maxmemory-policy` set to `allkeys-lru` or `volatile-lru` as appropriate.
  - TLS and auth enabled; use VPC/private networking where available.
  - Monitor memory, CPU, and latency; set alerts.
- Edge/HTTP Caching
  - Introduce CDN rules to cache `/_next/image` (by querystring) and public assets aggressively.
  - If using Cloudflare CDN, ensure dynamic routes are cached only when safe.
- Cloudflare Images (Optional but Recommended)
  - Store Cloudflare Images URLs/IDs in DB.
  - Enable `NEXT_PUBLIC_CF_IMAGE_LOADER=1` so `next/image` uses CF derivatives and offloads resizes.
  - Define sane variant(s) and purge/warm top N images post-deploy.

Phase 3 — Rendering & Delivery (50k–100k/day)
- SSR/ISR for Hot Pages
  - Render homepage/category pages via SSR with ISR (or static regeneration) where safe, to leverage Vercel edge caching.
  - Hydrate interactivity client-side, but serve HTML fast from the edge.
- Navigation Strategy
  - For PWAs, consider `StaleWhileRevalidate` for navigation to avoid stalls on slow networks.
  - Throttle client prefetch on low-end devices/networks.
- Parallelism & Connection Pooling
  - Set DB connection pool sizes per instance, and cap concurrency at the reverse proxy to protect the DB.
- Backpressure
  - Enforce request timeouts (API & DB) and circuit breakers around Redis/DB.

Phase 4 — Realtime & Horizontal Scale (100k+/day)
- WebSocket Scale-Out
  - Run multiple WS instances on Fly; use shared pub/sub (Redis, Upstash, or managed message bus) for fanout and presence.
  - Batch/aggregate presence updates server-side to reduce chatter.
  - Test idle and peak connection counts; autoscale WS instances.
- Job/Queue Offloading
  - Move heavy tasks (NLP parsing, email batches, migrations) to a worker with a queue (e.g., RQ, Celery, Sidekiq-like).
- Global Regions
  - Add additional regions for API if user base becomes multi-region; keep data locality consistent with privacy rules.

Operational Runbooks
- Cache Flush
  - Artist list: delete keys `service_provider_profiles:list:*` to refresh all lists.
  - Availability: delete `availability:<artist_id>:*` to refresh an artist’s entries.
- Image Migrations
  - `POST /api/v1/ops/migrate-service-media-to-files`
  - `POST /api/v1/ops/migrate-profile-images-to-files`
  - Admin UI under “Migrations” triggers both and returns JSON results.
- Smoke Tests (post-deploy)
  - Provider list: loads < 500ms TTFB on repeat hit; first hit acceptable if cold.
  - `/_next/image` requests: confirm 200 with cache headers; repeat requests faster.
  - Upload a new image; confirm Next.js optimization and visible thumbnail.
  - Safari: homepage first paint quick; prefetch guarded.

Observability & SLOs
- RUM
  - Track LCP/TTFB per route (homepage, category, provider profile). Bucket by device & network conditions.
- Metrics
  - Cache HIT/MISS for list and availability; log counts and expose to dashboards.
  - DB: query latencies, slow-query logs, connection pool saturation.
  - Redis: memory, evictions, latency, errors.
  - Image optimizer: rate, latency, error counts.
- Alerts
  - High MISS ratio, surge in 5xx, DB latency > budget, Redis unavailable, image errors > threshold.

Security & Reliability
- Rate Limiting
  - Strict on auth endpoints, uploads, message send paths.
- WAF/CDN Rules
  - Block common bots/abuse; cap request rates; restrict methods.
- CORS/Auth
  - Confirm prod CORS origins and cookie scopes (Secure/SameSite) for auth flows.
- Backups
  - DB backups (daily) with retention; restore drills quarterly.

Deployment & Rollouts
- Fly.io (API)
  - Region: user-near (e.g., `jnb`).
  - Health checks: `/healthz` configured (present in fly.toml).
  - Secrets: set `REDIS_URL`, DB URL/creds for Postgres when ready.
  - Autoscaling: configure min/max machines and CPU/memory to handle spikes.
- Vercel (Frontend)
  - `NEXT_PUBLIC_API_URL` pointing to the API origin.
  - ISR/edge caching for hot pages once SSR is enabled.
- Canary & Rollback
  - Canary deploy or percentage rollouts where feasible; rollback on budget violations.

Testing & Load Validation
- Synthetic Load
  - Use k6/Artillery to simulate homepage/category traffic with realistic concurrency.
  - Targets: p95 TTFB < 600ms cached; 95% success rate under peak.
- Playwright/Smoke
  - Run smoke scenarios post-deploy (homepage, category, provider profile, upload flow).
- Image Warmup (Optional)
  - Pre-request top N images post-deploy to warm optimizer/CDN caches.

Cost Awareness
- Redis
  - Size to hold hot keys; evict LRU. Monitor network egress.
- Images
  - Next optimizer CPU vs. Cloudflare Images cost; move heavy resize traffic off app nodes.
- DB
  - Instance size vs. query complexity. Invest in indexes & query shaping before scaling vertically.

Owner’s Action List (Next 2–4 Weeks)
- Set `REDIS_URL` secret in Fly; verify hits for list/availability.
- Migrate DB to Postgres; add the indexes above; run slow-query logging.
- Add a CDN rule for `/_next/image` or plan Cloudflare Images adoption with loader.
- Begin RUM & cache HIT/MISS telemetry; set basic alerts.
- Review provider list endpoint for full-table materialization and per-row availability calls; plan refactor to paginated SQL + bulk/precomputed availability.

References
- Frontend image config: `frontend/next.config.js` (remotePatterns, rewrites).
- Safe image wrapper: `frontend/src/components/ui/SafeImage.tsx`.
- List caching utils: `backend/app/utils/redis_cache.py`.
- Provider list API: `backend/app/api/v1/api_service_provider.py`.
- Fly config: `fly.toml` (add `REDIS_URL`, region, mounts).
- Admin ops/migrations: Admin → Migrations page; or `backend/app/api/api_ops.py`.

Changelog
- 2025-08-29: Initial version.
