// components/chat/MessageThread/hooks/useThreadData.ts
// Phase 4: Centralize thread data lifecycle (incremental start).
// Owns: messages state, loading, and a fetchMessages (initial/delta) identical in behavior.
// Next steps will move older paging, optimistic sends, reactions, and unread tracking.
import * as React from 'react';
import { isAxiosError } from 'axios';
import { useTransportState } from '@/hooks/useTransportState';
import { isOfflineError, isTransientTransportError, runWithTransport, classifyTransportError } from '@/lib/transportState';
import { getMessagesForBookingRequest, type MessageListParams } from '@/lib/api';
import { seedGlobalQuotes } from '@/hooks/useQuotes';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { getMessagesForBookingRequest as apiList, postMessageToBookingRequest, deleteMessageForBookingRequest, addMessageReaction, removeMessageReaction, uploadMessageAttachment } from '@/lib/api';
import {
  readThreadCache as _readThreadCache,
  writeThreadCache as _writeThreadCache,
} from '@/lib/chat/threadCache';
import { safeParseDate } from '@/lib/chat/threadStore';
import { getSummaries as cacheGetSummaries, setSummaries as cacheSetSummaries } from '@/lib/chat/threadCache';
import { normalizeMessage as normalizeShared } from '@/lib/normalizers/messages';
import { getEphemeralStubs, clearEphemeralStubs } from '@/lib/chat/ephemeralStubs';

type ThreadMessage = any; // Keep flexible; UI uses normalized fields downstream

function mergeMessages(prev: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  if (!incoming?.length) return prev;
  const byId = new Map<number, ThreadMessage>();
  for (const m of prev) { if (m && typeof m.id === 'number') byId.set(m.id, m); }
  for (const m of incoming) {
    if (!m || typeof m.id !== 'number') continue;
    const prior = byId.get(m.id);
    if (!prior) byId.set(m.id, m);
    else byId.set(m.id, { ...prior, ...m });
  }
  const out = Array.from(byId.values());
  out.sort((a, b) => {
    const at = new Date(a.timestamp || 0).getTime();
    const bt = new Date(b.timestamp || 0).getTime();
    if (at !== bt) return at - bt;
    return (a.id || 0) - (b.id || 0);
  });
  return out;
}

function coerceString(value: any): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
}

function coerceTimestamp(value: any): number {
  if (!value) return 0;
  const ms = safeParseDate(String(value)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export type FetchMessagesOptions = {
  // Modes are ignored (always fetch full history as requested by ops)
  mode?: 'initial' | 'incremental';
  force?: boolean;
  reason?: string;
  limit?: number;
  behavior?: 'replace' | 'merge_update';
};

type HookOpts = {
  isActiveThread?: boolean;
  ensureQuotesLoaded?: (ids: number[]) => void | Promise<void>;
  onMessagesFetched?: (subset: ThreadMessage[], source: 'fetch'|'older'|'delta'|'cache'|'hydrate') => void;
};

export function useThreadData(threadId: number, opts?: HookOpts) {
  const isActiveThread = opts?.isActiveThread !== false;
  const transport = useTransportState();
  // Seed from sessionStorage/IDB synchronously so the first fetch can use a cursor
  const [messages, setMessages] = React.useState<ThreadMessage[]>(() => {
    try {
      const arr = _readThreadCache(threadId);
      if (!Array.isArray(arr) || arr.length === 0) return [] as ThreadMessage[];
      const normalized = arr
        .map((m: any) => normalizeShared(m) as any)
        .filter((m: any) => Number.isFinite((m as any)?.id))
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return normalized as ThreadMessage[];
    } catch {
      return [] as ThreadMessage[];
    }
  });
  const [loading, setLoading] = React.useState<boolean>(() => {
    try {
      const arr = _readThreadCache(threadId);
      return !(Array.isArray(arr) && arr.length > 0);
    } catch { return true; }
  });
  const [loadingOlder, setLoadingOlder] = React.useState<boolean>(false);
  const [reachedHistoryStart, setReachedHistoryStart] = React.useState<boolean>(false);

  // Local refs for lifecycle
  const messagesRef = React.useRef<ThreadMessage[]>([]);
  const fetchInFlightRef = React.useRef<boolean>(false);
  const refetchRequestedRef = React.useRef<null | FetchMessagesOptions>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const missingThreadRef = React.useRef<boolean>(false);
  const initialLoadedRef = React.useRef<boolean>(false);
  const lastMessageIdRef = React.useRef<number | null>(null);
  // Note: ThreadPane remounts MessageThread on thread switches via a keyed wrapper,
  // so stale responses from a previous thread instance won't merge into the new one.

  React.useEffect(() => { messagesRef.current = messages; }, [messages]);
  // Merge ephemeral stubs on arrival for instant display
  React.useEffect(() => {
    const applyStubs = () => {
      try {
        const stubs = getEphemeralStubs(threadId) || [];
        if (!Array.isArray(stubs) || stubs.length === 0) return;
        const normalized = stubs
          .map((m: any) => normalizeShared(m) as any)
          .filter((m: any) => Number.isFinite((m as any)?.id));
        setMessages((prev) => mergeMessages(prev, normalized));
      } catch {}
    };
    applyStubs();
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent<{ threadId?: number }>).detail || {};
        if (Number(detail.threadId) !== Number(threadId)) return;
      } catch {}
      applyStubs();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('ephemeral:stubs', handler as any);
      return () => window.removeEventListener('ephemeral:stubs', handler as any);
    }
    return () => {};
  }, [threadId]);
  React.useEffect(() => {
    // If we already have messages (seeded synchronously), skip async seed
    if (messagesRef.current && messagesRef.current.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const arr = _readThreadCache(threadId);
        if (cancelled || !Array.isArray(arr) || arr.length === 0) return;
        const normalized = arr
          .map((m: any) => normalizeShared(m) as any)
          .filter((m: any) => Number.isFinite((m as any)?.id))
          .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const last = Number((normalized as any)[(normalized as any).length - 1]?.id || 0);
        if ((normalized as any).length) {
          lastMessageIdRef.current = Number.isFinite(last) && last > 0 ? last : null;
          setMessages(normalized as any);
          setLoading(false);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [threadId]);

  const fetchMessages = React.useCallback(
    async (options: FetchMessagesOptions = {}) => {
      if (missingThreadRef.current) return;
      if (fetchInFlightRef.current) {
        refetchRequestedRef.current = { ...options };
        return;
      }
      if (!options.force && !isActiveThread) return;
      fetchInFlightRef.current = true;
      // Disable delta/lite; always perform a full fetch
      const FULL_LIMIT = options.limit != null ? options.limit : 5000;
      setLoading(true);

      const params: MessageListParams = {
        // Load everything up to FULL_LIMIT in one shot
        limit: FULL_LIMIT,
      } as MessageListParams;
      // Always request full mode; include fields for UI richness
      params.mode = 'full' as any;
      params.fields = 'attachment_meta,reply_to_preview,quote_id,reactions,my_reactions';

      const queueRetry = (reason: 'offline' | 'transient') => {
        runWithTransport(
          `thread-fetch:${threadId}`,
          () => fetchMessages({ ...options, force: true }),
          { metadata: { type: 'thread-fetch', threadId, retryReason: reason } },
        );
      };

      if (!transport.online && !options.force) {
        setLoading(false);
        fetchInFlightRef.current = false;
        queueRetry('offline');
        return;
      }

      try {
        // Pass known quotes for dedupe (best-effort)
        // Abort any previous in‑flight request for this thread instance
        try { abortRef.current?.abort(); } catch {}
        abortRef.current = new AbortController();
        const res = await apiList(threadId, params as any, { signal: abortRef.current.signal });
        try {
          const qmap = (res.data as any)?.quotes as Record<number, any> | undefined;
          if (qmap && typeof qmap === 'object') seedGlobalQuotes(Object.values(qmap).filter(Boolean) as any);
        } catch {}
        const items = Array.isArray((res.data as any)?.messages)
          ? (res.data as any).messages
          : Array.isArray((res.data as any)?.items)
            ? (res.data as any).items
            : Array.isArray(res.data)
              ? (res.data as any)
              : [];
        const normalized: ThreadMessage[] = items.map((m: any) => normalizeShared(m) as any).filter((m: any) => Number.isFinite(m.id));
        setMessages((prev) => {
          const next = mergeMessages(prev, normalized);
          const last = next[next.length - 1];
          if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
          return next;
        });
        setLoading(false);
        initialLoadedRef.current = true;
        // Since we loaded the entire window, treat history as complete when under limit
        try {
          const hasMore = Boolean((res as any)?.data?.has_more);
          setReachedHistoryStart(!hasMore || normalized.length < FULL_LIMIT);
        } catch { setReachedHistoryStart(true); }
        try { opts?.onMessagesFetched?.(normalized, 'fetch'); } catch {}
        // Drop ephemeral stubs now that real data arrived
        try {
          clearEphemeralStubs(threadId);
          setMessages((prev) => prev.filter((m: any) => Number(m?.id) > 0));
        } catch {}
      } catch (err) {
        // Ignore silent aborts when switching threads quickly
        if (isAxiosError(err) && (err as any).code === 'ERR_CANCELED') {
          setLoading(false);
          return;
        }
        if (isAxiosError(err)) {
          const status = err.response?.status;
          if (status === 404) {
            const had = (messagesRef.current?.length || 0) > 0;
            if (!had) {
              missingThreadRef.current = true;
              setMessages([]);
            }
            setLoading(false);
            return;
          }
          if (status === 403) {
            setLoading(false);
            queueRetry('transient');
            return;
          }
          if (isTransientTransportError(err) || isOfflineError(err)) {
            setLoading(false);
            queueRetry(isOfflineError(err) ? 'offline' : 'transient');
            return;
          }
        } else if (isTransientTransportError(err) || isOfflineError(err)) {
          setLoading(false);
          queueRetry(isOfflineError(err) ? 'offline' : 'transient');
          return;
        }
        // Hard error
        // eslint-disable-next-line no-console
        console.error('Failed to fetch messages:', err);
        setLoading(false);
      } finally {
        fetchInFlightRef.current = false;
        // Clear controller after resolution
        try { abortRef.current = null; } catch {}
        const queued = refetchRequestedRef.current;
        refetchRequestedRef.current = null;
        if (queued) void fetchMessages({ mode: queued.mode ?? 'incremental', force: true, reason: queued.reason ?? 'queued-refetch' });
      }
    },
    [threadId, isActiveThread, transport.online],
  );

  // Abort on unmount to reduce wasted work
  React.useEffect(() => () => { try { abortRef.current?.abort(); } catch {} }, []);

  // Send a message via API and return the normalized server message (does not modify local list).
  const send = React.useCallback(async (payload: any, opts?: { idempotencyKey?: string; clientRequestId?: string }): Promise<ThreadMessage> => {
    const res = await postMessageToBookingRequest(threadId, payload, opts as any);
    return normalizeShared(res.data) as any;
  }, [threadId]);

  // Optional attachment upload helper: returns { url, metadata }
  const upload = React.useCallback(async (file: File, onProgress?: (pct: number) => void, signal?: AbortSignal) => {
    const res = await uploadMessageAttachment(threadId, file, (evt) => {
      if (onProgress && evt.total) {
        const pct = Math.round((evt.loaded * 100) / evt.total);
        onProgress(pct);
      }
    }, signal);
    return res.data;
  }, [threadId]);

  const deleteMessage = React.useCallback(async (messageId: number) => {
    await deleteMessageForBookingRequest(threadId, messageId);
  }, [threadId]);

  // Track in-flight reaction toggles to avoid duplicate taps
  const reactionInflightRef = React.useRef<Set<string>>(new Set());

  const reactToggle = React.useCallback(async (messageId: number, emoji: string, hasNow: boolean) => {
    const inflightKey = `${threadId}:${messageId}:${emoji}`;
    if (reactionInflightRef.current.has(inflightKey)) return;
    reactionInflightRef.current.add(inflightKey);
    // Optimistic local update
    setMessages((prev) => prev.map((m: any) => {
      if (Number(m?.id) !== Number(messageId)) return m;
      const next: any = { ...m };
      const agg: Record<string, number> = { ...(m.reactions || {}) };
      const mineSet = new Set<string>((m.my_reactions || []) as string[]);
      if (hasNow) {
        if (mineSet.has(emoji)) mineSet.delete(emoji);
        const curr = Number(agg[emoji] || 0) - 1;
        if (curr > 0) agg[emoji] = curr; else delete agg[emoji];
      } else {
        mineSet.add(emoji);
        agg[emoji] = Number(agg[emoji] || 0) + 1;
      }
      next.reactions = agg;
      next.my_reactions = Array.from(mineSet);
      return next;
    }));
    const taskId = `reaction:${threadId}:${messageId}:${emoji}:${hasNow ? 'remove' : 'add'}`;
    const revert = () => {
      setMessages((prev) => prev.map((m: any) => {
        if (Number(m?.id) !== Number(messageId)) return m;
        const next: any = { ...m };
        const agg: Record<string, number> = { ...(m.reactions || {}) };
        const mineSet = new Set<string>((m.my_reactions || []) as string[]);
        if (hasNow) {
          // removal failed → add it back
          mineSet.add(emoji);
          agg[emoji] = Number(agg[emoji] || 0) + 1;
        } else {
          // add failed → undo add
          if (mineSet.has(emoji)) mineSet.delete(emoji);
          const curr = Number(agg[emoji] || 0) - 1;
          if (curr > 0) agg[emoji] = curr; else delete agg[emoji];
        }
        next.reactions = agg;
        next.my_reactions = Array.from(mineSet);
        return next;
      }));
    };

    const runner = async () => {
      if (hasNow) await removeMessageReaction(threadId, messageId, emoji);
      else await addMessageReaction(threadId, messageId, emoji);
    };

    try {
      const maybePromise = runWithTransport(taskId, runner, {
        metadata: { type: 'reaction', threadId, messageId, emoji, op: hasNow ? 'remove' : 'add' },
        onFailure: () => { revert(); },
      });
      if (maybePromise && typeof (maybePromise as any).then === 'function') {
        await (maybePromise as Promise<void>);
      }
    } finally {
      reactionInflightRef.current.delete(inflightKey);
    }
  }, [threadId]);

  const ingestExternalMessage = React.useCallback((raw: any) => {
    if (!raw) return;
    const clientReqId = (raw && (raw.client_request_id || raw.clientRequestId)) ? String(raw.client_request_id || raw.clientRequestId) : '';
    const incoming = normalizeShared(raw) as any;
    if (!Number.isFinite(incoming?.id)) return;
    if (clientReqId) {
      const tempId = cidToTempRef.current.get(clientReqId);
      if (Number.isFinite(tempId)) {
        setMessages((prev) => {
          const tid = Number(tempId);
          const withoutTemp = prev.filter((m: any) => Number(m?.id) !== tid);
          const already = withoutTemp.some((m: any) => Number(m?.id) === Number(incoming.id));
          const mergedList = already ? withoutTemp : [...withoutTemp, { ...incoming, status: 'sent' }];
          mergedList.sort((a: any, b: any) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
          const last = mergedList[mergedList.length - 1];
          if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
          return mergedList as any;
        });
        try { cidToTempRef.current.delete(clientReqId); } catch {}
        try { import('@/lib/chat/threadsEvents').then(({ emitThreadsUpdated }) => emitThreadsUpdated({ threadId, reason: 'message', immediate: true }, { immediate: true, force: true })); } catch {}
        return;
      }
    }
    setMessages((prev) => {
      const prior = prev.find((m: any) => Number(m?.id) === Number(incoming.id));
      let safeIncoming = incoming;
      if (prior && prior.attachment_url && !incoming.attachment_url) {
        // Preserve local preview/progress when placeholder echo lacks a URL
        safeIncoming = { ...incoming, attachment_url: prior.attachment_url } as any;
        if ((prior as any)._upload_pct != null) (safeIncoming as any)._upload_pct = (prior as any)._upload_pct;
      }
      const next = mergeMessages(prev, [safeIncoming]);
      const last = next[next.length - 1];
      if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
      return next;
    });
  }, [threadId]);

  // Unified send with offline queue + retry runner using transport task queue
  // Correlation: client_request_id -> temp message id (per thread)
  const cidToTempRef = React.useRef<Map<string, number>>(new Map());

  const sendWithQueue = React.useCallback(
    async (
      tempId: number,
      exec: () => Promise<ThreadMessage>,
      onSuccess: (real: ThreadMessage) => void,
      onFailure?: () => void,
      options?: { kind?: 'text' | 'voice' | 'file'; clientRequestId?: string },
    ) => {
      const kind = options?.kind || 'text';
      const clientRequestId = options?.clientRequestId && typeof options.clientRequestId === 'string' ? options.clientRequestId : undefined;
      if (clientRequestId && (kind === 'text' || kind === 'voice')) {
        try { cidToTempRef.current.set(clientRequestId, Number(tempId)); } catch {}
      }
      const taskId = `send:${threadId}:${Math.abs(Number(tempId) || Date.now())}`;
      const run = async () => {
        // Mark as sending just before attempt
        setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === Number(tempId) ? { ...m, status: 'sending' } : m)));
        const real = await exec();
        onSuccess(real);
        if (clientRequestId) {
          try { cidToTempRef.current.delete(clientRequestId); } catch {}
        }
      };
      // Always enqueue via transport runner so transient failures auto-retry
      if (!transport.online) {
        setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === Number(tempId) ? { ...m, status: 'queued' } : m)));
      } else {
        // Online now: mark sending immediately
        setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === Number(tempId) ? { ...m, status: 'sending' } : m)));
      }
      runWithTransport(taskId, run, {
        metadata: { type: 'message-send', threadId, tempId, kind },
        onFailure: (err?: unknown) => {
          try { onFailure?.(); } catch {}
          // For text/voice, keep queued instead of failed to "never fail" UX
          if (kind === 'file') {
            setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === Number(tempId) ? { ...m, status: 'failed' } : m)));
          } else {
            const meta = classifyTransportError(err);
            const hard4xx = meta.status && [401,403,404,413,422].includes(meta.status);
            setMessages((prev: any[]) => prev.map((m: any) => (
              Number(m?.id) === Number(tempId)
                ? { ...m, status: hard4xx ? 'failed' : 'queued' }
                : m
            )));
          }
        },
        immediateOnReconnect: true,
        maxAttempts: kind === 'file' ? 8 : 100000, // effectively "never fail" for text/voice
        initialDelayMs: 800,
        maxDelayMs: 60000,
      });
    },
    [threadId, transport.online],
  );

  const applyReadReceipt = React.useCallback((upToId: number, readerId: number, myUserId?: number | null) => {
    if (!Number.isFinite(upToId) || myUserId == null || !Number.isFinite(myUserId)) return;
    setMessages((prev) =>
      prev.map((msg) => {
        if (Number(msg?.sender_id) !== myUserId) return msg;
        if (!Number.isFinite(msg?.id) || Number(msg.id) > upToId) return msg;
        if (msg.read_at || msg.is_read) return msg;
        return {
          ...msg,
          is_read: true,
          read_at: msg.read_at || new Date().toISOString(),
        };
      }),
    );
  }, []);

  const applyDelivered = React.useCallback((upToId: number, recipientId: number, myUserId?: number | null) => {
    if (!Number.isFinite(upToId) || myUserId == null || !Number.isFinite(myUserId)) return;
    // Flip only my messages (sent by me) with id <= upToId to delivered
    setMessages((prev) =>
      prev.map((msg: any) => {
        const fromMe = Number(msg?.sender_id) === Number(myUserId);
        if (!fromMe) return msg;
        if (!Number.isFinite(msg?.id) || Number(msg.id) > upToId) return msg;
        if (msg.is_read || msg.read_at) return msg; // read wins
        if (msg.is_delivered || msg.delivered_at) return msg;
        return {
          ...msg,
          is_delivered: true,
          delivered_at: msg.delivered_at || new Date().toISOString(),
        };
      }),
    );
  }, []);

  const fetchOlder = React.useCallback(async () => {
    if (loadingOlder || reachedHistoryStart) return { added: 0 } as const;
    const list = messagesRef.current;
    if (!list || list.length === 0) return { added: 0 } as const;
    // Earliest numeric id in current list
    let earliest: number | null = null;
    for (let i = 0; i < list.length; i += 1) {
      const id = Number(list[i]?.id);
      if (Number.isFinite(id) && id > 0) { earliest = id; break; }
    }
    if (!earliest || earliest <= 1) return { added: 0 } as const;
    setLoadingOlder(true);
    try {
      const res = await apiList(threadId, ({ limit: 500, mode: 'lite', before_id: earliest, fields: 'attachment_meta,reply_to_preview,quote_id,reactions,my_reactions' } as any));
      const rows = Array.isArray((res as any)?.data?.items) ? (res as any).data.items : [];
      if (!rows.length) {
        setReachedHistoryStart(true);
        return { added: 0 } as const;
      }
      const older: ThreadMessage[] = [];
      for (const raw of rows as any[]) {
        const msg = normalizeShared(raw) as any;
        // Include booking-details system messages so users can see the full summary in history
        older.push(msg);
      }
      if (!older.length) return { added: 0 } as const;
      setMessages((prev) => {
        const next = mergeMessages(older, prev);
        const last = next[next.length - 1];
        if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
        return next;
      });
      try {
        const qids = Array.from(new Set(older.map((m: any) => Number(m.quote_id)).filter((n) => Number.isFinite(n) && n > 0)));
        if (qids.length) await opts?.ensureQuotesLoaded?.(qids);
      } catch {}
      if (!(res as any)?.data?.has_more || rows.length < 500) setReachedHistoryStart(true);
      try { opts?.onMessagesFetched?.(older, 'older'); } catch {}
      return { added: older.length } as const;
    } catch {
      return { added: 0 } as const;
    } finally {
      setLoadingOlder(false);
    }
  }, [threadId, loadingOlder, reachedHistoryStart]);

  React.useEffect(() => {
    if (!threadId) return;
    if (!messages.length) {
      lastMessageIdRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    const lastId = Number(last?.id || 0);
    if (Number.isFinite(lastId)) lastMessageIdRef.current = lastId;
    const existing = (cacheGetSummaries() as any[]).find((s) => Number(s?.id) === Number(threadId));
    const nextTimestamp = coerceTimestamp(last?.timestamp ?? new Date().toISOString());
    if (existing && Number((existing as any).last_message_id || 0) === lastId) {
      return;
    }
    if (existing) {
      const existingTimestamp = coerceTimestamp((existing as any).last_message_timestamp || (existing as any).updated_at || (existing as any).created_at);
      if (existingTimestamp > nextTimestamp) {
        return;
      }
    }
    // Prefer server-provided preview label when available; otherwise, collapse
    // booking-details summaries to a safe label for the thread preview.
    const rawPreviewLabel = (last as any)?.preview_label ? String((last as any).preview_label) : '';
    const contentText = coerceString(last?.content ?? last?.text ?? '');
    const collapsedPreview = rawPreviewLabel
      || (contentText.startsWith(BOOKING_DETAILS_PREFIX) ? 'New Booking Request' : contentText);

    try {
      const list = cacheGetSummaries() as any[];
      const nextList = list.map((s: any) => (Number(s?.id) === Number(threadId)
        ? {
            ...s,
            last_message_id: Number(last?.id || 0) || s.last_message_id || undefined,
            last_message_content: collapsedPreview,
            last_message_timestamp: last?.timestamp ?? new Date().toISOString(),
            last_sender_id: Number(last?.sender_id ?? last?.senderId ?? 0) || s.last_sender_id || undefined,
          }
        : s));
      cacheSetSummaries(nextList as any);
    } catch {}
  }, [messages, threadId]);

  React.useEffect(() => {
    try {
      _writeThreadCache(threadId, messages);
    } catch {}
  }, [messages, threadId]);

  // Public surface for Phase 4 (incremental)
  return {
    messages,
    setMessages,
    loading,
    // Expose setLoading temporarily so the legacy component logic can drive skeletons
    setLoading,
    fetchMessages,
    fetchOlder,
    loadingOlder,
    reachedHistoryStart,
    handlers: {
      send,
      upload,
      deleteMessage,
      reactToggle,
      ingestExternalMessage,
      applyReadReceipt,
      applyDelivered,
      sendWithQueue,
    },
  } as const;
}
