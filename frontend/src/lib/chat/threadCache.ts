import Dexie, { Table } from 'dexie';

// Unified chat cache: one cache → two subscribers → zero wasted work.
// This file owns summaries, per-thread messages, and unread bookkeeping,
// and exposes a subscribe() API usable with useSyncExternalStore selectors.

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

// Minimal summary record used by the conversation list
export type ThreadSummary = {
  id: number;
  last_message_id?: number | null;
  last_message_timestamp?: string | null;
  last_message_content?: string | null;
  unread_count?: number;
  state?: string | null;
  counterparty_label?: string | null;
  counterparty_avatar_url?: string | null;
  // Ephemeral realtime fields
  typing?: boolean;
  presence?: string | null;
  last_presence_at?: number | null;
};

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

// ————————————————————————————————————————————————————————————————
// In-memory unified cache + subscription layer

type Listener = () => void;

const summaries: Map<number, ThreadSummary> = new Map();
let summariesArray: ThreadSummary[] = [];
const messagesById: Map<number, any[]> = new Map();
const lastReadById: Map<number, number> = new Map();
const listeners: Set<Listener> = new Set();

function notify() {
  listeners.forEach((fn) => { try { fn(); } catch {} });
}

function sortSummaries(arr: ThreadSummary[]): ThreadSummary[] {
  return [...arr].sort((a, b) => {
    const at = Date.parse(String(a.last_message_timestamp || '')) || 0;
    const bt = Date.parse(String(b.last_message_timestamp || '')) || 0;
    if (bt !== at) return bt - at;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
}

function shallowEqualMessages(a: any[], b: any[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i];
    const bi = b[i];
    if (Number(ai?.id) !== Number(bi?.id)) return false;
    // If ids match and content changed, treat as change
    const ac = (ai?.content ?? ai?.text ?? '') as any;
    const bc = (bi?.content ?? bi?.text ?? '') as any;
    if (ac !== bc) return false;
  }
  return true;
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getSummaries(): ThreadSummary[] { return summariesArray; }

export function setSummaries(list: ThreadSummary[]): void {
  if (!Array.isArray(list)) { summaries.clear(); summariesArray = []; notify(); return; }
  const next = sortSummaries(list.map((it) => ({ ...it, id: Number(it.id) })));
  // Reuse object identities where possible to keep list stable
  const byId = new Map<number, ThreadSummary>();
  next.forEach((it) => {
    const id = Number(it.id);
    const prev = summaries.get(id);
    const merged = prev ? { ...prev, ...it } : it;
    byId.set(id, merged);
  });
  summaries.clear();
  byId.forEach((v, k) => summaries.set(k, v));
  const arr = Array.from(summaries.values());
  const sorted = sortSummaries(arr);
  // Only swap array reference if contents changed
  const same = summariesArray.length === sorted.length && summariesArray.every((s, i) => Number(s.id) === Number(sorted[i].id) && s.last_message_content === sorted[i].last_message_content && s.last_message_timestamp === sorted[i].last_message_timestamp && Number(s.unread_count || 0) === Number(sorted[i].unread_count || 0));
  if (!same) summariesArray = sorted;
  notify();
}

export function updateSummary(id: number, patch: Partial<ThreadSummary>) {
  const tid = Number(id);
  const prev = summaries.get(tid) || ({ id: tid } as ThreadSummary);
  const next = { ...prev, ...patch } as ThreadSummary;
  summaries.set(tid, next);
  summariesArray = sortSummaries(Array.from(summaries.values()));
  notify();
}

export function getMessages(conversationId: number): any[] {
  return messagesById.get(Number(conversationId)) || [];
}

export function setMessages(conversationId: number, page: any[], replace = true): void {
  const id = Number(conversationId);
  const prev = messagesById.get(id) || [];
  const normalized = Array.isArray(page) ? page.slice().sort((a, b) => {
    const at = Date.parse(String(a?.timestamp || '')) || 0;
    const bt = Date.parse(String(b?.timestamp || '')) || 0;
    if (at !== bt) return at - bt;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  }) : [];
  const next = replace ? normalized : (() => {
    const map = new Map<number, any>();
    prev.forEach((m) => { if (Number.isFinite(Number(m?.id))) map.set(Number(m.id), m); });
    normalized.forEach((m) => { if (Number.isFinite(Number(m?.id))) map.set(Number(m.id), { ...map.get(Number(m.id)), ...m }); });
    return Array.from(map.values()).sort((a, b) => {
      const at = Date.parse(String(a?.timestamp || '')) || 0;
      const bt = Date.parse(String(b?.timestamp || '')) || 0;
      if (at !== bt) return at - bt;
      return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
  })();
  if (!shallowEqualMessages(prev, next)) {
    messagesById.set(id, next);
    // Persist a bounded slice for fast warm-starts
    try { writeThreadCache(id, next); } catch {}
    // Update summary preview optimistically
    const tail = next[next.length - 1];
    if (tail) {
      const s = summaries.get(id) || ({ id } as ThreadSummary);
      const ts = String(tail.timestamp || new Date().toISOString());
      const text = String(tail.preview_label || tail.content || tail.text || '') || s.last_message_content || '';
      summaries.set(id, { ...s, last_message_id: Number(tail.id) || s.last_message_id || null, last_message_timestamp: ts, last_message_content: text });
      summariesArray = sortSummaries(Array.from(summaries.values()));
    }
    notify();
  }
}

export function upsertMessage(msg: any): void {
  if (!msg) return;
  const id = Number(msg.booking_request_id || msg.thread_id || msg.conversation_id || 0);
  if (!Number.isFinite(id) || id <= 0) return;
  const prev = messagesById.get(id) || [];
  const without = prev.filter((m) => Number(m?.id) !== Number(msg.id));
  const next = [...without, msg].sort((a, b) => {
    const at = Date.parse(String(a?.timestamp || '')) || 0;
    const bt = Date.parse(String(b?.timestamp || '')) || 0;
    if (at !== bt) return at - bt;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
  if (!shallowEqualMessages(prev, next)) {
    messagesById.set(id, next);
    try { writeThreadCache(id, next); } catch {}
    const tail = next[next.length - 1];
    if (tail) {
      const s = summaries.get(id) || ({ id } as ThreadSummary);
      const ts = String(tail.timestamp || new Date().toISOString());
      const text = String(tail.preview_label || tail.content || tail.text || '') || s.last_message_content || '';
      const prevUnread = Number(s.unread_count || 0);
      const unread = Number(msg.sender_id) && Number(msg.sender_id) !== Number((window as any)?.__currentUserId || 0)
        ? prevUnread + 1
        : prevUnread;
      summaries.set(id, { ...s, last_message_id: Number(tail.id) || s.last_message_id || null, last_message_timestamp: ts, last_message_content: text, unread_count: unread });
      summariesArray = sortSummaries(Array.from(summaries.values()));
    }
    notify();
  }
}

export function setLastRead(conversationId: number, lastReadMessageId?: number | null) {
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (Number.isFinite(Number(lastReadMessageId))) lastReadById.set(id, Number(lastReadMessageId));
  const s = summaries.get(id);
  if (s) {
    const next = { ...s, unread_count: 0 } as ThreadSummary;
    summaries.set(id, next);
    summariesArray = sortSummaries(Array.from(summaries.values()));
    notify();
  }
}

export function applyReadServer(conversationId: number, unreadCount: number, lastReadAt?: string | null) {
  const id = Number(conversationId);
  const s = summaries.get(id);
  if (!s) return;
  summaries.set(id, { ...s, unread_count: Math.max(0, Number(unreadCount || 0)) });
  summariesArray = sortSummaries(Array.from(summaries.values()));
  notify();
}

export function getTotalUnread(): number {
  let total = 0;
  summaries.forEach((s) => { total += Number(s.unread_count || 0); });
  return total;
}

// Utilities for tests/bootstrapping
export function __seedSummaries(list: ThreadSummary[]) { setSummaries(list); }
export function __clearAll() {
  summaries.clear();
  summariesArray = [];
  messagesById.clear();
  lastReadById.clear();
  notify();
}

// moved to lib/chat
