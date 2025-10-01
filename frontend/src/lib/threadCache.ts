// Lightweight sessionStorage-backed thread cache with simple LRU capping.
// Keys are shared with MessageThread and ConversationList to avoid duplication.

export const THREAD_CACHE_PREFIX = 'inbox:thread';
const THREAD_LRU_KEY = `${THREAD_CACHE_PREFIX}:lru:v1`;
const MAX_THREADS_DEFAULT = 20;
const IDB_MESSAGE_LIMIT = 200;
const IDB_MAX_THREADS = 60;
const THREAD_DB_NAME = 'booka-inbox';
const THREAD_DB_VERSION = 1;
const THREAD_STORE_NAME = 'threads';

type ThreadRecord = {
  id: number;
  messages: any[];
  updatedAt: number;
  lastMessageId: number | null;
  messageCount: number;
};
export type ThreadStoreRecord = ThreadRecord;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isBrowserIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function openThreadDb(): Promise<IDBDatabase | null> {
  if (!isBrowserIndexedDBAvailable()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(THREAD_DB_NAME, THREAD_DB_VERSION);
        request.onupgradeneeded = () => {
          try {
            const db = request.result;
            if (!db.objectStoreNames.contains(THREAD_STORE_NAME)) {
              const store = db.createObjectStore(THREAD_STORE_NAME, { keyPath: 'id' });
              store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
          } catch {}
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          resolve(null);
        };
        request.onblocked = () => {
          resolve(request.result || null);
        };
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function pruneIndexedDb(maxThreads: number) {
  const db = await openThreadDb();
  if (!db) return;
  try {
    const readTx = db.transaction(THREAD_STORE_NAME, 'readonly');
    const readStore = readTx.objectStore(THREAD_STORE_NAME);
    const readIndex = readStore.index('updatedAt');
    const keys = await wrapRequest(readIndex.getAllKeys());
    await new Promise<void>((resolve) => {
      readTx.oncomplete = () => resolve();
      readTx.onabort = () => resolve();
      readTx.onerror = () => resolve();
    });
    if (!Array.isArray(keys) || keys.length <= maxThreads) return;
    const surplus = keys.length - maxThreads;
    if (surplus <= 0) return;
    const toDelete = keys.slice(0, surplus);
    if (!toDelete.length) return;
    const writeTx = db.transaction(THREAD_STORE_NAME, 'readwrite');
    const writeStore = writeTx.objectStore(THREAD_STORE_NAME);
    for (const key of toDelete) {
      try { writeStore.delete(key as IDBValidKey); } catch {}
    }
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error ?? new Error('IndexedDB prune failed'));
      writeTx.onabort = () => resolve();
    });
  } catch {}
}

async function writeThreadToIndexedDb(id: number, messages: any[], maxThreads = IDB_MAX_THREADS) {
  const db = await openThreadDb();
  if (!db) return;
  const slice = Array.isArray(messages)
    ? messages.slice(Math.max(0, messages.length - IDB_MESSAGE_LIMIT))
    : [];
  const record: ThreadRecord = {
    id,
    messages: slice,
    updatedAt: Date.now(),
    lastMessageId: slice.length ? Number(slice[slice.length - 1]?.id ?? slice[slice.length - 1]?.message_id ?? null) || null : null,
    messageCount: slice.length,
  };
  try {
    const tx = db.transaction(THREAD_STORE_NAME, 'readwrite');
    tx.objectStore(THREAD_STORE_NAME).put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => resolve();
    });
    await pruneIndexedDb(maxThreads);
  } catch {}
}

export async function readThreadFromIndexedDb(id: number): Promise<ThreadRecord | null> {
  const db = await openThreadDb();
  if (!db) return null;
  try {
    const tx = db.transaction(THREAD_STORE_NAME, 'readonly');
    const store = tx.objectStore(THREAD_STORE_NAME);
    const record = await wrapRequest(store.get(id));
    return (record as ThreadRecord) ?? null;
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
  const db = await openThreadDb();
  if (!db) return;
  try {
    const tx = db.transaction(THREAD_STORE_NAME, 'readwrite');
    tx.objectStore(THREAD_STORE_NAME).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'));
      tx.onabort = () => resolve();
    });
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
    const slice = Array.isArray(messages)
      ? messages.slice(Math.max(0, messages.length - IDB_MESSAGE_LIMIT))
      : [];
    writeJSON(cacheKeyForThread(id), slice);
    touchLRU(id, maxThreads);
    pruneLRU(maxThreads);
  } catch {}
  void writeThreadToIndexedDb(id, messages);
}
