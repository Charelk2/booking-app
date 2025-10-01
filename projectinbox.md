# Project Inbox Revamp Plan

## Goal
Deliver WhatsApp-level fast conversation switching and perceived instant load for Booka’s Inbox/MessageThread without altering the existing server-managed security model. Improvements land in five feature-flagged batches mapped to Ideas 1, 2, 3, 4, and 6 (skipping client-side E2EE), each with crisp acceptance criteria, observability, and rollback paths.

## Scope, Non-Goals, Success Criteria

### In Scope
- Render and UI performance for `MessageThread`, Inbox/ConversationList, and dependent flows.
- Data access patterns: caching, hydration order, prefetching, delta sync.
- Backend contract tweaks purely for performance (pagination, payload shape, avatar handling) without altering product semantics.

### Explicit Non-Goals
- No move to client-side E2EE or key management changes.
- No visual redesign beyond lightweight UX affordances (skeletons, placeholders) that support speed perception.
- No changes to core messaging semantics (read receipts, typing, payments flow logic).

### Why We Lag Behind WhatsApp
- **Hydration model**: the thread resets local state and re-fetches on every switch (`frontend/src/components/booking/MessageThread.tsx:1357`, `frontend/src/components/booking/MessageThread.tsx:1493`). WhatsApp hydrates from an on-device DB, then Background-syncs.
- **Rendering**: `MessageThread` is a monolith (>3k LOC) with virtualization off by default (`VIRTUALIZE` flag) so large DOM trees render each time.
- **Ancillary waterfalls**: quotes, booking details, payments resolve synchronously before the thread feels ready (`frontend/src/components/booking/MessageThread.tsx:1668`, `frontend/src/components/booking/MessageThread.tsx:1735`).
- **Payload heft**: backend joins inject avatars and redundant metadata on every read (`backend/app/crud/crud_message.py:44`).

### Success Criteria (SLOs)
- **Hot switch** (thread cached locally): ≤150 ms to first paint, ≤350 ms to ready-to-send.
- **Warm switch** (prefetched but not opened): ≤300 ms to first paint, ≤600 ms to ready.
- **Cold switch** (no local cache): ≤800 ms to first paint on 4G, ≤1.3 s to ready.
- **Scroll restore**: 100% accuracy on reopen.
- **Reliability**: failed loads per switch <0.5% P95.

### Measurement & Instrumentation
- RUM events: `inbox_switch_start`, `thread_hydrate_first_paint`, `thread_ready`, `thread_scroll_restored`, `inbox_prefetch_batch_ms` with P50/P95 dashboards.
- Network profiles captured during canary rollouts.
- Backend latency and payload histograms for message list endpoints.
- Next instrumentation: cache hit/miss ratios from the Dexie store, secondary-pipeline latency/error events, and delta-contract success metrics feeding the Inbox SLO dashboards.

## Implementation Batches Overview
| Batch | Focus | Idea |
|-------|-------|------|
| 1 | Rendering & state stabilization | Idea 1 |
| 2 | Persistent thread store (IndexedDB) | Idea 2 |
| 3 | Prefetching & inbox sync | Idea 3 |
| 4 | Secondary data pipelines | Idea 4 |
| 5 | Backend performance & contracts | Idea 6 |

Batch 1 is now baked in by default (no flags). Later batches can still be staged, but the rendering/scroll changes are permanent unless reverted by code.

### Current Status
- Batch 1 (rendering/state stabilization) shipped and soaking in production; realtime merge fixes plus virtualization flag removal are stable with no open regressions.
- Batch 2 (persistent thread store) shipped; instrumentation for cache hit/miss ratios and thread metadata expansion is still outstanding.
- Batch 3 (prefetching/sync) shipped; prefetch queue meets latency targets and runs unflagged.
- Batch 4 (secondary pipelines) partially planned—initial reuse of hydrated booking payloads is live, but fetch inventory, placeholder specs, and non-blocking error flows remain.
- Batch 5 (backend contracts) partially delivered—payload trimming landed, while delta contract, lightweight/enriched response negotiation, and index/TTL work are pending.
- Instrumentation dashboards for Inbox SLOs are live; need to extend with Batch 2 cache metrics and Batch 4/5 error tracking before broader rollout.

---

## Batch 1 — Rendering & State Stabilization (Idea 1)

**Objectives**
- Make virtualization the default while keeping a kill-switch.
- Decompose `MessageThread` into memoized subcomponents (ThreadViewport, Bubble, SystemBanner, Composer, ThreadHeader).
- Introduce a unified scroll manager to preserve position and prevent layout thrash.

**Current Observations**
- `VIRTUALIZE` flag is opt-in through `NEXT_PUBLIC_VIRTUALIZE_CHAT`; default path renders the full DOM tree.
- Scroll state resets during thread switches due to state clears and `useLayoutEffect` bottom anchoring.
- Ancillary UI (payment banners, quote cards) renders inline without skeletons, causing jank.

**Deliverables**
- Virtualized rendering as the default path; non‑virtual path removed.
- Component boundaries and memoization of render‑only pieces.
- Unified scroll behavior handled by the virtualized viewport.
- Skeleton states for bubble placeholders and initial readiness.

**Acceptance Criteria**
- Switching between two 5k+ message threads (cached) maintains ≥55 FPS on mid-tier laptops; P95 input delay <50 ms.
- No visible scroll jumps; last position restored exactly.

**Risks & Mitigations**
- Virtualization edge cases (pinned system banners, unread anchors) → separate anchor layer outside list flow.
- Mobile regressions → device-matrix QA and perf budget checks.

**Rollback**
- Requires a code revert (no runtime flags). Use your backup branch/commit to restore the previous behavior if needed.

**Status (Implemented)**
- Virtualized rendering is always ON; non‑virtual code and runtime flags have been removed.
- Extracted memoized, render‑only pieces:
  - `frontend/src/components/booking/ThreadDayDivider.tsx` (day separator line)
  - `frontend/src/components/booking/ThreadMessageGroup.tsx` (group wrapper)
- Unified scroll handled by the virtualized viewport; no DOM anchoring hacks.
- Lightweight skeletons render during initial load for better perceived readiness.

---

## Batch 2 — Persistent Thread Store (IndexedDB) (Idea 2)

**Objectives**
- Promote the session cache to IndexedDB (Dexie/LocalForage) for instant local hydration and offline continuity.
- Define deterministic merge logic between local cache and server deltas.

**Current Observations**
- Session cache trims to 200 messages per thread (`frontend/src/lib/threadCache.ts:1`), losing history and forcing refetches.
- Cache clears on tab close; no offline continuity.

**Deliverables**
- IndexedDB-backed thread cache (`frontend/src/lib/threadCache.ts`) storing the most recent ~200 messages per thread with `updatedAt`, `lastMessageId`, and `messageCount` metadata; 60-thread LRU eviction enforced.
- Session cache mirror preserved for synchronous hydration while IndexedDB load resolves; MessageThread promotes cached payloads and uses cached `lastMessageId` for delta fetches.
- Clear-on-logout/session-expiry pipeline (`AuthContext.logout` and session-expired handler) to drop IndexedDB + session caches.
- Runtime behaviour defaults to IndexedDB; sessionStorage mirroring remains as an immediate fallback for environments where IndexedDB is unavailable.

**Status (Implemented)**
- IndexedDB write/read path shipped; MessageThread now hydrates locally before requesting deltas.
- Follow-up: add structured instrumentation (cache hit vs. cold fetch) and expand records with lightweight thread metadata for conversation list prefetch.

**Acceptance Criteria**
- Hot switch first paint ≤150 ms P95 for cached threads.
- IndexedDB queries P95 ≤10 ms for last 200 messages.

**Risks & Mitigations**
- Storage quota exhaustion → monitor quota events, dynamically adjust per-thread caps.
- Dedupe bugs → canonical IDs, audit rules, automated merge tests.

**Rollback**
- Roll back via code revert or by shipping a hotfix that short-circuits `openThreadDb()` to return `null`.

---

## Batch 3 — Prefetching & Inbox Sync (Idea 3)

**Objectives**
- Background prefetch Top‑N likely threads so first switch feels instant.
- Keep Inbox metadata synchronized via realtime events + persistent store updates.

**Current Observations**
- Inbox fetches once on mount and never updates until user refreshes (`frontend/src/components/booking/ThreadList.tsx:15`).
- No background prefetch; first open always waits on REST fetch.

**Deliverables**
- Network-aware prefetch queue (`frontend/src/lib/threadPrefetcher.ts`) adapts Top N and concurrency to connection quality, persists to IndexedDB, and mirrors session cache for instant hydrations.
- Inbox wiring (`app/inbox/page.tsx`) supplies prioritized candidates on mount, focus, realtime updates, and selection changes while respecting a 5-minute staleness window before refetching.
- Queue backs off gracefully when `navigator.onLine` is false or `saveData` is enabled, then resumes on `online`/visibilitychange.

**Acceptance Criteria**
- Opening any prefetched thread after inbox load lands ≤300 ms first paint P95 (observed in staging smoke tests).
- Background fetch volume remains within the adaptive budget (≤15 % overhead on constrained links).

**Risks & Mitigations**
- Adaptive policies: `navigator.connection` effective type/downlink drive queue size; metered connections (save-data) pause prefetch entirely.
- Staleness enforcement: each cached entry carries `updatedAt`; queue skips fresh records (<5 min) and refreshes older ones before showing stale data.
- Offline resilience: queue parks items while offline and retries when the browser reconnects.

**Rollback**
- Replace `initThreadPrefetcher` wiring with a no-op or revert the queue integration to fall back on IndexedDB-only hydration.

---

## Batch 4 — Secondary Data Pipelines (Idea 4)

**Objectives**
- De-waterfall ancillary data (quotes, booking, payments) so thread becomes interactive before extras resolve.

**Current Observations**
- Quote and booking lookups run synchronously before UI feels ready (blocking ready-to-send).
- Late-arriving data shifts layout (no reserved skeletons).

**Deliverables**
- Inventory of ancillary fetches classified as “must-have for first paint” vs “defer”.
- Aggregation plan: either single “thread context” endpoint or prioritized background fetches.
- UI placeholders with fixed dimensions to avoid CLS; composer availability decoupled from secondary requests.
- Non-blocking error handling with unobtrusive retries.

**Progress**
- Inbox now reuses booking request payloads supplied by the thread list, eliminating repeated `/booking-requests/{id}` fetches on every switch and keeping ancillary fetches in the background.
- Quote and booking mutations trigger a local refresh hook instead of rereading the entire request synchronously, letting the composer stay live while secondary data streams in.
- Secondary pipeline now runs behind `NEXT_PUBLIC_INBOX_SECONDARY_PIPELINE_ENABLED`; `MessageThread` defers booking-request and client booking hydrations via a staged idle queue so initial painter stays snappy.
- Skeleton components (`BookingSummarySkeleton`, `QuoteBubbleSkeleton`, `EventPrepSkeleton`) reserve space for booking panels, quote bubbles, and prep cards while ancillary fetches complete, keeping the composer available.

**Open Work**
- Document rollout plan for the staged hydrator vs. future consolidated endpoint (capabilities, kill-switch, expected benefits).
- Decouple composer readiness from ancillary fetch promises and surface non-blocking retry toasts for failures.
- Add targeted logging/metrics (`inbox_secondary_pipeline_latency`, error counts) to prove de-waterfalling improves perceived readiness.

**Ancillary Fetch Inventory (2025-07-07)**
| Data slice | API helper(s) | Initiator | Trigger & timing | First paint? | Owner |
|------------|---------------|-----------|------------------|--------------|-------|
| Booking request payload | `getBookingRequestById` | `MessageThread` effect (`frontend/src/components/booking/MessageThread.tsx:1227`) | Runs on mount or `refreshBookingRequest()` bumps version when no `initialBookingRequest` provided | Required today; target to defer once thread list passes hydrated payload + placeholder | Inbox FE |
| Booking details (accepted quote) | `getBookingDetails` | `ensureQuoteLoaded` (`frontend/src/components/booking/MessageThread.tsx:1369-1387`) | Fired when quote arrives with a `booking_id` | Defer; use cached summary placeholder until hydrate | Inbox FE |
| Booking details (client resolve) | `getMyClientBookings`, `getBookingDetails` | `resolveBookingFromRequest` (`frontend/src/components/booking/MessageThread.tsx:1875-1887`) | Invoked after thread activation on client side | Defer; keep composer live while summary panel shows skeleton | Inbox FE |
| Quote info | `getQuotesBatch`, `getQuoteV2` | Post-fetch quote hydration (`frontend/src/components/booking/MessageThread.tsx:1588-1619`) | After message list fetch or as fallback on WS message | Defer; render quote skeleton with CTA placeholders | Inbox FE |
| Service provider lookup | `getService` | `ensureServiceProviderForService` (`frontend/src/components/booking/MessageThread.tsx:804-832`) | Lazy fetch when a service id lacks cached provider mapping | Defer; fallback to generic provider label | Inbox FE |
| Provider reviews (quote peek) | `getServiceProviderReviews` | `QuoteBubble` `useEffect` (`frontend/src/components/booking/QuoteBubble.tsx:284-297`) | Runs when quote modal renders with provider id | Defer/optional; load after modal open | Inbox FE |
| Event prep checklist | `getEventPrep` | `EventPrepCard` bootstrap (`frontend/src/components/booking/EventPrepCard.tsx:82-97`) | When Event Prep card mounts for confirmed bookings | Defer; card should show CTA skeleton until data arrives | Inbox FE |

**Placeholder & Composer Plan**
- Booking summary panel: introduce a `BookingSummarySkeleton` that reserves 420 px height on desktop (modal) and 280 px on mobile, mirroring image + list layout; swap in until either `initialBookingRequest` or `bookingDetails` resolves so CLS stays <0.02.
- Quote bubbles: render a fixed 220 px skeleton block for `QUOTE` messages while `quotes[quote_id]` is missing, keeping CTA button slots and amount rows in place so the composer never blocks on quote hydration.
- Payment/instant-book CTA: dedicate a 72 px high placeholder button row that appears whenever a quote is pending but payment data not ready, avoiding jumps when `openPaymentModal` injects the banner.
- Event prep card: add skeleton tiles for the progress bar and step list (3 × 56 px rows) so the card can mount immediately after booking confirmation without awaiting `getEventPrep`.
- Composer readiness: gate only on `disableComposer` / auth errors; ancillary fetch failures should show inline retry toasts but leave the textarea active and message list interactive.

**Acceptance Criteria**
- Time to first input unchanged from Batch 3 baseline (±5%).
- CLS from ancillary content ≤0.02.

**Risks & Mitigations**
- Hidden coupling where callers expect enriched payload → ship under flag with compatibility shim.

**Rollback**
- Disable `inbox.secondary_pipeline.enabled`; revert to existing waterfall while keeping placeholder styles if harmless.

---

## Batch 5 — Backend Performance & Contract Tightening (Idea 6)

**Objectives**
- Shrink payloads and latency for message list endpoints; enable delta fetches and external avatar caching.

**Current Observations**
- `get_messages_for_request` joins sender profiles and returns full payload each time (`backend/app/crud/crud_message.py:44`).
- No `after_id` support beyond simple filters; clients still refetch full slices.
- Avatars/Profile data repeated per message; no caching hints.

**Deliverables**
- Delta contract: message list supports `after_id`/`since_ts` returning only new/changed messages with cursors.
- Lightweight vs enriched responses controlled via param/capability token.
- Index audits and additions (e.g., `(booking_request_id, timestamp, id)` composite) plus EXPLAIN plan validation.
- Stable media URLs with long TTL to prevent repeated avatar payloads.
- Observability: P50/P95 latency, payload size histograms, DB timing dashboards.

**Progress**
- Message list endpoint switched to `selectinload` for senders and profiles, trimming redundant joins and cutting latency (<10 ms on staging for 20–60 message slices).
- Attachment metadata now strips embedded base64 previews, so payloads for attachment-heavy threads dropped from ~1.8 MB to tens of kilobytes while preserving signed URLs for browser fetch.
- `get_recent_messages_for_requests` batches the latest messages per thread, powering thread previews without issuing N queries.

**Open Work**
- Design and expose the delta contract (`after_id`/`since_ts` cursors + pagination semantics) and negotiate client capability flags to fall back safely.
- Implement lightweight vs. enriched response modes, including avatar/media URL TTL handling and cache headers.
- Add and verify composite indexes (e.g., `(booking_request_id, created_at, id)`) with EXPLAIN plans captured in docs.
- Extend observability: payload/latency histograms per mode, delta response error tracking, and alert thresholds.
- Provide migration guidance for existing consumers (MessageThread, notifications) and stage rollout behind `inbox.delta_api.enabled` or similar feature flag.

**Acceptance Criteria**
- P95 latency for “latest 50 messages” down ≥30%; payload size down ≥40% from baseline.
- Delta fetch returns in ≤150 ms P95 on production infra.

**Risks & Mitigations**
- Client expectation of enriched payload → staged rollout with server flag and client capability negotiation.

**Rollback**
- Revert API param handling to legacy path; leave additive delta endpoints disabled.

---

## Cross-Cutting Concerns

### Feature Flags
- Batches 1–3 now ship without runtime flags; their behaviour is always enabled.
- Upcoming batches may still use targeted flags (e.g., `inbox.secondary_pipeline.enabled`) during staged rollouts.
- Keep an emergency kill-switch pattern for future incremental launches even if current stages run unflagged.

### QA Matrix
- Devices: recent Mac/Windows laptops, mid-tier Android (3–4 GB RAM), iPhone SE class.
- Networks: Good 4G (25 Mbps), Constrained 4G (5 Mbps, 100 ms RTT), offline/flaky simulation.
- Thread sizes: <100, ~1k, ≥5k messages; attachment-heavy and text-only scenarios.
- Add-ons for upcoming batches: prefetch enabled vs disabled, cache-warm vs cold, ancillary data failures (quotes/payments) with retry UX, and delta-pagination smoke tests.

### Security & Privacy
- IndexedDB cleared on sign-out/account switch; respect private/incognito limitations.
- No additional PII stored locally beyond existing payloads; follow least-data policy.

### Monitoring & Alerting
- Instrument front-end RUM events before enabling flags at scale.
- Backend metrics (latency, payload size, DB timings) tracked with thresholds for go/no-go decisions.

### Rollout Strategy
- Canary (internal accounts) → 10% → 50% → 100% with 24–48 hour soak per step.
- Roll back if SLOs regress or error rate rises above threshold.

---

## Handover Artifacts & Responsibilities
- Architecture note showing current vs target data flow for Inbox/MessageThread.
- Contracts sheet documenting request/response fields for list, delta, thread metadata.
- Test plan: manual step-by-step flows, perf capture instructions, acceptance checklists.
- Risk register maintained per batch (owner, mitigation, status).
- Suggested ownership & timeline:
  - Batch 1: Frontend Perf + UX (1–2 sprints)
  - Batch 2: Frontend Data + Infra (2 sprints)
  - Batch 3: Frontend Data + Realtime (1 sprint)
  - Batch 4: Frontend/Backend Integrations (1 sprint)
  - Batch 5: Backend Perf + Contracts (1–2 sprints)

---

## Appendices

**Glossary**
- *Hot switch*: opening a thread with a fully cached local page.
- *Warm switch*: thread prefetched but not yet opened this session.
- *Cold switch*: thread with no local cache available.

**Rollback Checklists**
- Pre-filled per batch, detailing toggle locations and verification steps post-rollback.

**Open Questions (track during execution)**
1. What IndexedDB library fits existing bundle budgets best (Dexie vs LocalForage vs custom)?
2. Do we need server support for cursor-based pagination beyond `after_id` to meet SLOs?
3. Can we reuse existing metrics pipeline or do we need new dashboards for Inbox-specific SLOs?
4. What attachment size limits should trigger skipping local caching to respect storage budgets?
