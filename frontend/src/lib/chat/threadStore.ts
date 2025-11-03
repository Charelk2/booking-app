import type { BookingRequest } from '@/types';

type Listener = () => void;

type ThreadExtras = {
  last_message_id?: number;
  last_message_timestamp?: string | null;
  last_message_content?: string | null;
  last_sender_id?: number | null;
  unread_count?: number;
  is_unread_by_current_user?: boolean;
  last_read_message_id?: number | null;
  last_read_at?: string | null;
  typing?: boolean;
  presence?: string | null;
  last_typing_at?: number | null;
  last_presence_at?: number | null;
};

type ThreadRecord = BookingRequest & ThreadExtras;

function cloneThread(thread: ThreadRecord): ThreadRecord {
  return { ...thread };
}

function coerceTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = safeParseDate(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function safeParseDate(raw: string | null | undefined): Date {
  if (!raw) return new Date(0);
  const trimmed = raw.trim();
  if (!trimmed) return new Date(0);
  const isoLike = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed);
  const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed);
  if (isoLike && !hasOffset) {
    return new Date(`${trimmed}Z`);
  }
  return new Date(trimmed);
}

class ThreadStoreInternal {
  private threads: ThreadRecord[] = [];
  private listeners: Set<Listener> = new Set();
  private activeThreadId: number | null = null;

  getThreads(): ThreadRecord[] {
    return this.threads;
  }

  getThread(threadId: number): ThreadRecord | undefined {
    return this.threads.find((thread) => thread.id === threadId);
  }

  getActiveThreadId(): number | null {
    return this.activeThreadId;
  }

  setActiveThread(threadId: number | null) {
    if (this.activeThreadId === threadId) return;
    this.activeThreadId = threadId;
    this.notify();
  }

  replace(items: BookingRequest[]) {
    if (!Array.isArray(items)) {
      this.threads = [];
      this.notify();
      return;
    }
    this.threads = items.map((item) => cloneThread(this.normalizeRecord(item)));
    this.sort();
    this.notify();
  }

  upsert(record: Partial<ThreadRecord> & { id: number }) {
    if (!record || !record.id) return;
    const existingIndex = this.threads.findIndex((t) => t.id === record.id);
    if (existingIndex >= 0) {
      const prev = this.threads[existingIndex];
      const prevTs = coerceTimestamp(prev.last_message_timestamp || prev.updated_at || prev.created_at);
      const merged = {
        ...this.threads[existingIndex],
        ...this.normalizeRecord(record, this.threads[existingIndex]),
      } as ThreadRecord;
      const nextTs = coerceTimestamp(merged.last_message_timestamp || merged.updated_at || merged.created_at);
      const orderingChanged = nextTs !== prevTs;
      this.threads = [
        ...this.threads.slice(0, existingIndex),
        cloneThread(merged),
        ...this.threads.slice(existingIndex + 1),
      ];
      if (orderingChanged) this.sort();
      this.notify();
      return;
    } else {
      const normalized = this.normalizeRecord(record);
      this.threads = [...this.threads, cloneThread(normalized)];
    }
    this.sort();
    this.notify();
  }

  update(threadId: number, patch: Partial<ThreadRecord>) {
    if (!threadId) return;
    const idx = this.threads.findIndex((thread) => thread.id === threadId);
    if (idx === -1) return;
    const prev = this.threads[idx];
    const prevTs = coerceTimestamp(prev.last_message_timestamp || prev.updated_at || prev.created_at);
    const merged = {
      ...this.threads[idx],
      ...this.normalizeRecord(patch, this.threads[idx]),
    } as ThreadRecord;
    const nextTs = coerceTimestamp(merged.last_message_timestamp || merged.updated_at || merged.created_at);
    const orderingChanged = nextTs !== prevTs;
    this.threads = [
      ...this.threads.slice(0, idx),
      cloneThread(merged),
      ...this.threads.slice(idx + 1),
    ];
    if (orderingChanged) this.sort();
    this.notify();
  }

  incrementUnread(threadId: number, amount = 1) {
    if (!threadId || amount <= 0) return;
    const idx = this.threads.findIndex((thread) => thread.id === threadId);
    if (idx === -1) return;
    const prev = this.threads[idx];
    const nextCount =
      prev.id === this.activeThreadId
        ? 0
        : Math.max(0, Number(prev.unread_count || 0) + amount);
    this.update(threadId, {
      unread_count: nextCount,
      is_unread_by_current_user: nextCount > 0,
    });
  }

  applyRead(threadId: number, lastMessageId?: number | null, readAt?: string | null) {
    if (!threadId) return;
    const idx = this.threads.findIndex((thread) => thread.id === threadId);
    if (idx === -1) return;
    const next = cloneThread({
      ...this.threads[idx],
      unread_count: 0,
      is_unread_by_current_user: false,
      last_read_message_id: lastMessageId ?? this.threads[idx].last_read_message_id ?? null,
      last_read_at: readAt ?? (this.threads[idx] as any).last_read_at ?? null,
    } as ThreadRecord & { last_read_at?: string | null });
    this.threads = [
      ...this.threads.slice(0, idx),
      next,
      ...this.threads.slice(idx + 1),
    ];
    this.notify();
  }

  mutate(updater: (threads: ThreadRecord[]) => ThreadRecord[]) {
    try {
      const next = updater(this.threads);
      if (!Array.isArray(next)) return;
      this.threads = next.map((record) => cloneThread(this.normalizeRecord(record)));
      this.sort();
      this.notify();
    } catch {
      // no-op
    }
  }

  getTotalUnread(): number {
    return this.threads.reduce(
      (acc, thread) => acc + (Number(thread.unread_count || 0) || 0),
      0,
    );
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private normalizeRecord<T extends Partial<ThreadRecord>>(record: T, fallback?: ThreadRecord): ThreadRecord {
    const base: ThreadRecord = {
      ...(fallback ?? ({} as ThreadRecord)),
      ...(record as ThreadRecord),
    };

    if (!base.last_message_timestamp) {
      base.last_message_timestamp =
        (base as any).last_message_at ||
        base.updated_at ||
        base.created_at ||
        null;
    }
    if (base.unread_count == null) {
      base.unread_count = Number((base as any).unread_count || 0);
    }
    if (base.is_unread_by_current_user == null) {
      base.is_unread_by_current_user = Boolean(
        base.unread_count && Number(base.unread_count) > 0,
      );
    }
    const fallbackTs = fallback
      ? coerceTimestamp(fallback.last_message_timestamp || fallback.updated_at || fallback.created_at)
      : 0;
    const mergedTs = coerceTimestamp(base.last_message_timestamp || base.updated_at || base.created_at);
    if (fallback && fallbackTs && mergedTs && mergedTs < fallbackTs) {
      base.last_message_timestamp = fallback.last_message_timestamp;
      base.last_message_content = fallback.last_message_content;
      base.last_message_id = fallback.last_message_id;
      base.last_sender_id = fallback.last_sender_id;
    }
    if (base.id === this.activeThreadId) {
      base.unread_count = 0;
      base.is_unread_by_current_user = false;
    }
    return base;
  }

  private sort() {
    this.threads = [...this.threads].sort((a, b) => {
      const at = coerceTimestamp(
        a.last_message_timestamp || a.updated_at || a.created_at,
      );
      const bt = coerceTimestamp(
        b.last_message_timestamp || b.updated_at || b.created_at,
      );
      if (bt !== at) return bt - at;
      return (b.id || 0) - (a.id || 0);
    });
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch {}
    });
  }
}

export const threadStore = new ThreadStoreInternal();
