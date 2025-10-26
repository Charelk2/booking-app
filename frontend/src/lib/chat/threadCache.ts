import Dexie, { Table } from 'dexie';

// Lightweight sessionStorage-backed thread cache with simple LRU capping.
// Keys are shared with MessageThread and ConversationList to avoid duplication.

export const THREAD_CACHE_PREFIX = 'inbox:thread';
const THREAD_LRU_KEY = `${THREAD_CACHE_PREFIX}:lru:v1`;
const MAX_THREADS_DEFAULT = 20;
const IDB_MESSAGE_LIMIT = 200;
const IDB_MAX_THREADS = 60;
const THREAD_DB_NAME = 'booka-inbox';

type ThreadRecord = {
  id: number;
  messages: any[];
  updatedAt: number;
  lastMessageId: number | null;
  messageCount: number;
};
export type ThreadStoreRecord = ThreadRecord;

class ThreadCacheDatabase extends Dexie {
  threads!: Table<ThreadRecord, number>;

  constructor() {
    super(THREAD_DB_NAME);
    this.version(1).stores({
      threads: '&id, updatedAt',
    });
  }
}

let dbInstance: ThreadCacheDatabase | null = null;
let dbInstancePromise: Promise<ThreadCacheDatabase | null> | null = null;

function isBrowserIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

async function getThreadDb(): Promise<ThreadCacheDatabase | null> {
  if (!isBrowserIndexedDBAvailable()) return null;
  if (dbInstance && dbInstance.isOpen()) return dbInstance;
  if (dbInstancePromise) return dbInstancePromise;

  dbInstancePromise = (async () => {
    let instance: ThreadCacheDatabase | null = null;
    try {
      instance = new ThreadCacheDatabase();
      instance.on('blocked', () => {
        // No-op; callers will gracefully fall back to sessionStorage.
      });
      await instance.open();
      dbInstance = instance;
      return instance;
    } catch (err) {
      try { instance?.close(); } catch {}
      dbInstance = null;
      dbInstancePromise = null;
      return null;
    }
  })();

  return dbInstancePromise;
}

async function pruneIndexedDb(db: ThreadCacheDatabase, maxThreads: number) {
  try {
    const ids = await db.threads.orderBy('updatedAt').primaryKeys();
    if (!Array.isArray(ids) || ids.length <= maxThreads) return;
    const surplus = ids.length - maxThreads;
    if (surplus <= 0) return;
    const toDelete = ids.slice(0, surplus);
    if (!toDelete.length) return;
    await db.threads.bulkDelete(toDelete as number[]);
  } catch {}
}

async function writeThreadToIndexedDb(id: number, messages: any[], maxThreads = IDB_MAX_THREADS) {
  const db = await getThreadDb();
  if (!db) return;
  const sliceRaw = Array.isArray(messages)
    ? messages.slice(Math.max(0, messages.length - IDB_MESSAGE_LIMIT))
    : [];
  // Filter out temp/sending items so opening a thread never shows stale clocks
  const slice = sliceRaw.filter((m: any) => {
    const idNum = Number((m?.id ?? m?.message_id) || 0);
    const status = String(m?.status || '').toLowerCase();
    if (!Number.isFinite(idNum) || idNum <= 0) return false;
    if (status === 'sending' || status === 'queued') return false;
    return true;
  });
  const record: ThreadRecord = {
    id,
    messages: slice,
    updatedAt: Date.now(),
    lastMessageId: slice.length ? Number(slice[slice.length - 1]?.id ?? slice[slice.length - 1]?.message_id ?? null) || null : null,
    messageCount: slice.length,
  };
  try {
    await db.transaction('rw', db.threads, async () => {
      await db.threads.put(record);
      await pruneIndexedDb(db, maxThreads);
    });
  } catch {}
}

export async function readThreadFromIndexedDb(id: number): Promise<ThreadRecord | null> {
  const db = await getThreadDb();
  if (!db) return null;
  try {
    const record = await db.threads.get(id);
    return record ?? null;
  } catch {
    return null;
  }
}

export async function hasThreadCacheAsync(id: number): Promise<boolean> {
  const record = await readThreadFromIndexedDb(id);
  return Boolean(record && Array.isArray(record.messages) && record.messages.length);
}

export async function clearThreadCaches(options: { includeSession?: boolean } = {}) {
  const { includeSession = true } = options;
  if (includeSession && typeof window !== 'undefined') {
    try {
      const lru = readLRU();
      for (const id of lru) {
        try { sessionStorage.removeItem(cacheKeyForThread(id)); } catch {}
      }
      sessionStorage.removeItem(THREAD_LRU_KEY);
    } catch {}
  }
  const db = await getThreadDb();
  if (!db) return;
  try {
    await db.threads.clear();
  } catch {}
}

export const isThreadStoreEnabled = () => isBrowserIndexedDBAvailable();

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
    const sliceRaw = Array.isArray(messages)
      ? messages.slice(Math.max(0, messages.length - IDB_MESSAGE_LIMIT))
      : [];
    const slice = sliceRaw.filter((m: any) => {
      const idNum = Number((m?.id ?? m?.message_id) || 0);
      const status = String(m?.status || '').toLowerCase();
      if (!Number.isFinite(idNum) || idNum <= 0) return false;
      if (status === 'sending' || status === 'queued') return false;
      return true;
    });
    writeJSON(cacheKeyForThread(id), slice);
    touchLRU(id, maxThreads);
    pruneLRU(maxThreads);
  } catch {}
  void writeThreadToIndexedDb(id, messages);
}
// moved to lib/chat
