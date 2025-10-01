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
- Stabilizing Batch 1: tightened `MessageThread` realtime merges (debounced read receipts now use a dedicated timer ref, dynamic Virtuoso ref typing corrected) to keep virtualization reliable ahead of wider QA.
- Batch 2 prep is queued behind Batch 1 soak; backlog grooming and IndexedDB spike notes remain unchanged until the current deployment bakes.

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
- Storage schema: threads (id, participants, lastMessageMeta, unreadCount, updatedAt) and messages (id, threadId, createdAt, authorId, kind, content refs, localStatus) with indices on `(threadId, createdAt)` and `(threadId, id)`.
- Cache lifecycle policy: size budget (~100–300 MB), LRU eviction, attachment meta retention (no blobs).
- Hydration order spec: local-first render → schedule delta fetch → reconcile with deterministic merge (by id and timestamp).
- Migration plan from sessionStorage; opt-in flag with auto-migrate once stable; clear on sign-out/account switch.

**Acceptance Criteria**
- Hot switch first paint ≤150 ms P95 for cached threads.
- IndexedDB queries P95 ≤10 ms for last 200 messages.

**Risks & Mitigations**
- Storage quota exhaustion → monitor quota events, dynamically adjust per-thread caps.
- Dedupe bugs → canonical IDs, audit rules, automated merge tests.

**Rollback**
- Disable `inbox.store.indexeddb`; regress to sessionStorage seamlessly.

---

## Batch 3 — Prefetching & Inbox Sync (Idea 3)

**Objectives**
- Background prefetch Top‑N likely threads so first switch feels instant.
- Keep Inbox metadata synchronized via realtime events + persistent store updates.

**Current Observations**
- Inbox fetches once on mount and never updates until user refreshes (`frontend/src/components/booking/ThreadList.tsx:15`).
- No background prefetch; first open always waits on REST fetch.

**Deliverables**
- Prefetch policy: fetch latest message pages for Top N (start 5–8) threads on Inbox load; triggers on app focus, realtime `threads:updated`, and after send/receive in active thread.
- Prefetch queue with concurrency limits, abort-on-navigation, and fairness.
- Staleness window rules (refresh if prefetched data >X minutes old).
- Inbox real-time subscription writing to IndexedDB, with list reordering based on local data.

**Acceptance Criteria**
- Opening any thread in Top N post-Inbox load yields ≤300 ms first paint P95.
- Prefetch bandwidth overhead ≤15% over baseline P50.

**Risks & Mitigations**
- Overuse on slow links → adaptive Top N based on downlink estimate, pause on metered networks.
- Cache churn → skip prefetch for inactive threads beyond threshold.

**Rollback**
- Turn off `inbox.prefetch.enabled`; keep real-time metadata updates in place.

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
- Per-batch flags plus master `inbox.revamp.enabled`.
- Emergency kill-switch: disable individual features without redeploys.

### QA Matrix
- Devices: recent Mac/Windows laptops, mid-tier Android (3–4 GB RAM), iPhone SE class.
- Networks: Good 4G (25 Mbps), Constrained 4G (5 Mbps, 100 ms RTT), offline/flaky simulation.
- Thread sizes: <100, ~1k, ≥5k messages; attachment-heavy and text-only scenarios.

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
