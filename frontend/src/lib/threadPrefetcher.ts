import { readThreadFromIndexedDb, readThreadCache } from '@/lib/threadCache';
import { trackEvent } from '@/lib/analytics';

export type PrefetchCandidate = {
  id: number;
  priority?: number;
  reason?: string;
  limit?: number;
  force?: boolean;
};

export type PrefetcherOptions = {
  defaultLimit?: number;
  staleMs?: number;
};

type QueueItem = {
  id: number;
  priority: number;
  reason: string;
  limit?: number;
  force?: boolean;
  enqueuedAt: number;
  attempts: number;
};

type Budget = {
  maxQueue: number;
  concurrency: number;
};

type FetchFn = (id: number, limit: number) => Promise<void>;

type Connection = {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
  onchange?: (() => void) | null;
};

const DEFAULT_LIMIT = 80;
const DEFAULT_STALE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

type InflightTiming = {
  startedAt: number;
  priority: number;
  reason: string;
  limit: number;
};

let fetchThread: FetchFn | null = null;
let options: Required<PrefetcherOptions> = {
  defaultLimit: DEFAULT_LIMIT,
  staleMs: DEFAULT_STALE_MS,
};

const queue = new Map<number, QueueItem>();
let activeThreadId: number | null = null;
let runningCount = 0;
let processing = false;
let initialized = false;

let connectionRef: Connection | null = null;
const cleanupCallbacks: Array<() => void> = [];
const inflightTimings = new Map<number, InflightTiming>();

const nowMs = (): number => {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {}
  return Date.now();
};

function getNavigatorConnection(): Connection | null {
  try {
    if (typeof navigator === 'undefined') return null;
    const conn = (navigator as any).connection as Connection | undefined;
    return conn ?? null;
  } catch {
    return null;
  }
}

function computeBudget(): Budget {
  const connection = getNavigatorConnection();
  const saveData = Boolean(connection?.saveData);
  if (saveData) return { maxQueue: 0, concurrency: 0 };

  const effectiveType = connection?.effectiveType || '';
  const downlink = typeof connection?.downlink === 'number' ? connection!.downlink : 10;

  if (!navigator?.onLine) {
    return { maxQueue: 0, concurrency: 0 };
  }

  if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.8) {
    return { maxQueue: 1, concurrency: 1 };
  }
  if (effectiveType === '3g' || downlink < 2.5) {
    return { maxQueue: 3, concurrency: 1 };
  }
  if (downlink < 5 || effectiveType === '4g') {
    return { maxQueue: 5, concurrency: 2 };
  }
  return { maxQueue: 6, concurrency: 2 };
}

function sortedQueueItems(): QueueItem[] {
  return Array.from(queue.values()).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.enqueuedAt - b.enqueuedAt;
  });
}

function scheduleProcess() {
  if (processing) return;
  processing = true;
  const run = () => {
    processing = false;
    processQueue();
  };
  try {
    if (typeof window !== 'undefined') {
      const handle = window.requestIdleCallback?.(run, { timeout: 500 });
      if (!handle) setTimeout(run, 0);
    } else {
      setTimeout(run, 0);
    }
  } catch {
    setTimeout(run, 0);
  }
}

function requeueItem(item: QueueItem, options: { incrementAttempt?: boolean } = {}) {
  const { incrementAttempt = true } = options;
  const nextAttempts = incrementAttempt ? item.attempts + 1 : item.attempts;
  if (nextAttempts > MAX_ATTEMPTS) return;
  queue.set(item.id, {
    ...item,
    enqueuedAt: Date.now(),
    attempts: nextAttempts,
  });
  scheduleProcess();
}

async function shouldPrefetch(item: QueueItem): Promise<boolean> {
  if (item.force) return true;
  try {
    const record = await readThreadFromIndexedDb(item.id);
    if (record && Array.isArray(record.messages) && record.messages.length > 0) {
      const age = Date.now() - (record.updatedAt || 0);
      if (age <= options.staleMs) return false;
      return true;
    }
  } catch {
    // ignore and fall through
  }
  const sessionMessages = readThreadCache(item.id);
  if (sessionMessages && sessionMessages.length > 0) {
    try {
      const last = sessionMessages[sessionMessages.length - 1];
      const ts = last?.timestamp ? new Date(last.timestamp).getTime() : NaN;
      if (!Number.isNaN(ts)) {
        const age = Date.now() - ts;
        if (age <= options.staleMs) return false;
      }
    } catch {}
  }
  return true;
}

function processQueue() {
  if (!fetchThread) return;
  const budget = computeBudget();
  if (budget.maxQueue <= 0 || budget.concurrency <= 0) {
    return;
  }
  if (runningCount >= budget.concurrency) return;
  const items = sortedQueueItems();
  if (!items.length) return;

  const item = items[0];
  queue.delete(item.id);

  if (item.id === activeThreadId) {
    scheduleProcess();
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    requeueItem(item, { incrementAttempt: false });
    return;
  }

  runningCount += 1;
  shouldPrefetch(item)
    .then(async (need) => {
      if (!need) return;
      const timing: InflightTiming = {
        startedAt: nowMs(),
        priority: item.priority,
        reason: item.reason,
        limit: item.limit ?? options.defaultLimit,
      };
      inflightTimings.set(item.id, timing);
      await fetchThread!(item.id, timing.limit);
    })
    .catch(() => {
      requeueItem(item, { incrementAttempt: true });
    })
    .finally(() => {
      runningCount = Math.max(0, runningCount - 1);
      const timing = inflightTimings.get(item.id);
      inflightTimings.delete(item.id);
      if (timing) {
        const duration = Math.max(0, nowMs() - timing.startedAt);
        trackEvent('inbox_prefetch_batch_ms', {
          threadId: item.id,
          durationMs: Math.round(duration),
          reason: timing.reason,
          priority: timing.priority,
          limit: timing.limit,
          remainingQueueSize: queue.size,
        });
      }
      if (queue.size && navigator?.onLine !== false) scheduleProcess();
    });

  if (runningCount < budget.concurrency && queue.size) {
    scheduleProcess();
  }
}

function pruneQueueToBudget() {
  const budget = computeBudget();
  if (budget.maxQueue <= 0) {
    queue.clear();
    return;
  }
  const items = sortedQueueItems();
  if (items.length <= budget.maxQueue) return;
  const keep = items.slice(0, budget.maxQueue);
  queue.clear();
  for (const item of keep) queue.set(item.id, item);
}

function upsertQueueItem(candidate: PrefetchCandidate) {
  if (!candidate.id) return;
  const existing = queue.get(candidate.id);
  const priority = Math.max(0, Math.round(candidate.priority ?? (existing?.priority ?? 0)));
  const item: QueueItem = {
    id: candidate.id,
    priority,
    reason: candidate.reason ?? existing?.reason ?? 'prefetch',
    limit: candidate.limit ?? existing?.limit,
    force: candidate.force ?? existing?.force ?? false,
    enqueuedAt: existing?.enqueuedAt ?? Date.now(),
    attempts: existing?.attempts ?? 0,
  };
  if (!existing || priority >= existing.priority || candidate.force) {
    item.enqueuedAt = Date.now();
    queue.set(candidate.id, item);
  }
}

function handleConnectionChange() {
  pruneQueueToBudget();
  scheduleProcess();
}

function attachConnectionListener() {
  const connection = getNavigatorConnection();
  if (!connection) return;
  connectionRef = connection;
  const listener = () => handleConnectionChange();
  if (typeof connection.addEventListener === 'function') {
    connection.addEventListener('change', listener);
    cleanupCallbacks.push(() => connection.removeEventListener?.('change', listener));
  } else if ('onchange' in connection) {
    const previous = (connection as any).onchange;
    (connection as any).onchange = () => {
      previous?.();
      listener();
    };
    cleanupCallbacks.push(() => {
      (connection as any).onchange = previous;
    });
  }
}

function attachGlobalListeners() {
  if (typeof window === 'undefined') return;
  const onOnline = () => scheduleProcess();
  const onVisibility = () => {
    if (!document.hidden) scheduleProcess();
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('visibilitychange', onVisibility);
  cleanupCallbacks.push(() => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('visibilitychange', onVisibility);
  });
}

export function initThreadPrefetcher(fetcher: FetchFn, opts: PrefetcherOptions = {}) {
  fetchThread = fetcher;
  options = {
    defaultLimit: opts.defaultLimit ?? DEFAULT_LIMIT,
    staleMs: opts.staleMs ?? DEFAULT_STALE_MS,
  };
  if (!initialized) {
    attachConnectionListener();
    attachGlobalListeners();
    initialized = true;
  }
  pruneQueueToBudget();
  scheduleProcess();
}

export function resetThreadPrefetcher() {
  queue.clear();
  runningCount = 0;
  processing = false;
  activeThreadId = null;
  fetchThread = null;
  connectionRef = null;
  while (cleanupCallbacks.length) {
    try {
      const cb = cleanupCallbacks.pop();
      cb?.();
    } catch {}
  }
  initialized = false;
}

export function enqueueThreadPrefetch(candidates: PrefetchCandidate[] | PrefetchCandidate) {
  if (!fetchThread) return;
  const list = Array.isArray(candidates) ? candidates : [candidates];
  for (const candidate of list) {
    if (!candidate || !candidate.id) continue;
    upsertQueueItem(candidate);
  }
  pruneQueueToBudget();
  scheduleProcess();
}

export function markThreadAsStale(id: number, priority = 250, reason = 'stale') {
  if (!id) return;
  enqueueThreadPrefetch({ id, priority, reason, force: false });
}

export function requestThreadPrefetch(id: number, priority = 180, reason = 'request', force = false) {
  if (!id) return;
  enqueueThreadPrefetch({ id, priority, reason, force });
}

export function setActivePrefetchThread(id: number | null) {
  activeThreadId = id ?? null;
}

export function kickThreadPrefetcher() {
  scheduleProcess();
}
