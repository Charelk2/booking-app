const MIN_INTERVAL_MS = 1200;
let lastEmitAt = 0;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

export interface ThreadsUpdatedDetail {
  source?: string;
  threadId?: number;
  immediate?: boolean;
  reason?: string;
}

interface EmitOptions {
  force?: boolean;
  immediate?: boolean;
}

export function emitThreadsUpdated(
  detail: ThreadsUpdatedDetail = {},
  options: EmitOptions = {},
) {
  if (typeof window === 'undefined') return;
  const wantsImmediate = Boolean(options.immediate ?? detail.immediate);
  const force = Boolean(options.force);
  const now = Date.now();
  const minGap = wantsImmediate ? 0 : MIN_INTERVAL_MS;

  if (!force && minGap > 0 && now - lastEmitAt < minGap) {
    if (!pendingTimeout) {
      const wait = Math.max(minGap - (now - lastEmitAt), 0) + 1;
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        emitThreadsUpdated(detail, { force: true, immediate: wantsImmediate });
      }, wait);
    }
    return;
  }

  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }

  lastEmitAt = now;
  const payload = wantsImmediate ? { ...detail, immediate: true } : { ...detail };
  try {
    window.dispatchEvent(new CustomEvent('threads:updated', { detail: payload }));
  } catch {}
}

export function resetThreadsUpdatedThrottle() {
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  lastEmitAt = 0;
}
// moved to lib/chat
