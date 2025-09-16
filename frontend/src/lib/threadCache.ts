// Lightweight sessionStorage-backed thread cache with simple LRU capping.
// Keys are shared with MessageThread and ConversationList to avoid duplication.

export const THREAD_CACHE_PREFIX = 'inbox:thread';
const THREAD_LRU_KEY = `${THREAD_CACHE_PREFIX}:lru:v1`;
const MAX_THREADS_DEFAULT = 20;

export function cacheKeyForThread(id: number): string {
  return `${THREAD_CACHE_PREFIX}:${id}:messages`;
}

function readJSON<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: any) {
  try {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function readThreadCache(id: number): any[] | null {
  return readJSON<any[]>(cacheKeyForThread(id));
}

export function hasThreadCache(id: number): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return !!sessionStorage.getItem(cacheKeyForThread(id));
  } catch {
    return false;
  }
}

function readLRU(): number[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = sessionStorage.getItem(THREAD_LRU_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function writeLRU(list: number[]) {
  try {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(THREAD_LRU_KEY, JSON.stringify(list));
  } catch {}
}

function touchLRU(id: number, max: number) {
  const cur = readLRU();
  const next = [id, ...cur.filter((x) => x !== id)];
  if (next.length > max) next.length = max; // trim in-memory
  writeLRU(next);
}

function pruneLRU(max: number) {
  try {
    if (typeof window === 'undefined') return;
    const cur = readLRU();
    if (cur.length <= max) return;
    const keep = cur.slice(0, max);
    const drop = cur.slice(max);
    for (const id of drop) {
      try { sessionStorage.removeItem(cacheKeyForThread(id)); } catch {}
    }
    writeLRU(keep);
  } catch {}
}

/**
 * Writes recent messages for a thread and updates the LRU list.
 * Keeps at most `maxThreads` thread caches in sessionStorage.
 */
export function writeThreadCache(id: number, messages: any[], maxThreads = MAX_THREADS_DEFAULT) {
  try {
    if (typeof window === 'undefined') return;
    const slice = Array.isArray(messages)
      ? messages.slice(Math.max(0, messages.length - 200))
      : [];
    writeJSON(cacheKeyForThread(id), slice);
    touchLRU(id, maxThreads);
    pruneLRU(maxThreads);
  } catch {}
}

