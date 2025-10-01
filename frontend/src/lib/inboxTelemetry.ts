import { trackEvent } from '@/lib/analytics';

export type ThreadSwitchSource =
  | 'list_click'
  | 'restored'
  | 'prefetch'
  | 'notification'
  | 'system'
  | 'unknown'
  | string;

export type ThreadSwitchSnapshot = {
  threadId: number;
  startedAtMs: number;
  startedAtEpochMs: number;
  source: ThreadSwitchSource;
  unreadBefore?: number;
};

const GLOBAL_KEY = '__bookaInboxSwitchSnapshot';

function nowMs(): number {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {}
  return Date.now();
}

export function recordThreadSwitchStart(
  threadId: number,
  meta: { source?: ThreadSwitchSource; unreadBefore?: number } = {},
): ThreadSwitchSnapshot {
  const snapshot: ThreadSwitchSnapshot = {
    threadId,
    startedAtMs: nowMs(),
    startedAtEpochMs: Date.now(),
    source: meta.source ?? 'unknown',
    unreadBefore: typeof meta.unreadBefore === 'number' ? meta.unreadBefore : undefined,
  };
  if (typeof window !== 'undefined') {
    (window as any)[GLOBAL_KEY] = snapshot;
  }
  trackEvent('inbox_switch_start', {
    threadId,
    source: snapshot.source,
    unreadBefore: snapshot.unreadBefore ?? null,
  });
  return snapshot;
}

export function getThreadSwitchSnapshot(threadId?: number): ThreadSwitchSnapshot | null {
  if (typeof window === 'undefined') return null;
  const value = (window as any)[GLOBAL_KEY];
  if (!value || typeof value !== 'object') return null;
  if (typeof threadId === 'number' && value.threadId !== threadId) return null;
  const snapshot = value as ThreadSwitchSnapshot;
  if (!Number.isFinite(snapshot.startedAtMs) || !Number.isFinite(snapshot.startedAtEpochMs)) {
    return null;
  }
  return snapshot;
}

export function clearThreadSwitchSnapshot(): void {
  if (typeof window === 'undefined') return;
  delete (window as any)[GLOBAL_KEY];
}

export function emissionPayload(base: {
  threadId: number;
  durationMs: number;
  cacheType?: string | null;
  stage: 'first_paint' | 'ready' | 'scroll_restored' | 'cache_hit' | 'cache_miss';
}): Record<string, unknown> {
  const snapshot = getThreadSwitchSnapshot(base.threadId);
  return {
    threadId: base.threadId,
    durationMs: Math.max(0, Math.round(base.durationMs)),
    cacheType: base.cacheType ?? null,
    source: snapshot?.source ?? 'unknown',
    startedAtEpochMs: snapshot?.startedAtEpochMs ?? null,
    stage: base.stage,
  };
}

export function trackHydrationEvent(payload: ReturnType<typeof emissionPayload>): void {
  const eventName = (() => {
    switch (payload.stage) {
      case 'cache_hit':
        return 'inbox_thread_cache_hit';
      case 'cache_miss':
        return 'inbox_thread_cache_miss';
      case 'first_paint':
        return 'thread_hydrate_first_paint';
      case 'ready':
        return 'thread_ready';
      case 'scroll_restored':
        return 'thread_scroll_restored';
      default:
        return 'thread_event';
    }
  })();
  trackEvent(eventName, payload);
}
