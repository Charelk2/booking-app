// components/chat/MessageThread/hooks/useThreadData.ts
// Phase 4: Centralize thread data lifecycle (incremental start).
// Owns: messages state, loading, and a fetchMessages (initial/delta) identical in behavior.
// Next steps will move older paging, optimistic sends, reactions, and unread tracking.

import * as React from 'react';
import { isAxiosError } from 'axios';
import { useTransportState } from '@/hooks/useTransportState';
import {
  isOfflineError,
  isTransientTransportError,
  runWithTransport,
  classifyTransportError,
} from '@/lib/transportState';
import {
  getMessagesForBookingRequest as listMessages,
  type MessageListParams,
  postMessageToBookingRequest,
  deleteMessageForBookingRequest,
  addMessageReaction,
  removeMessageReaction,
  uploadMessageAttachment,
} from '@/lib/api';
import { seedGlobalQuotes } from '@/hooks/useQuotes';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import {
  readThreadCache as readCache,
  writeThreadCache as writeCache,
  getSummaries as cacheGetSummaries,
  setSummaries as cacheSetSummaries,
  setLastRead as cacheSetLastRead,
  updateSummary as cacheUpdateSummary,
} from '@/lib/chat/threadCache';
import { safeParseDate } from '@/lib/chat/threadStore';
import { normalizeMessage as normalizeShared } from '@/lib/normalizers/messages';
import { getEphemeralStubs, clearEphemeralStubs } from '@/lib/chat/ephemeralStubs';

// ----------------------------
// Types
// ----------------------------

export type ThreadMessage = {
  id: number;                          // stable server id (>0) or temp (<0) for stubs
  booking_request_id?: number;
  sender_id?: number | null;
  sender_type?: 'CLIENT' | 'ARTIST' | 'SYSTEM' | string;
  message_type?: 'USER' | 'SYSTEM' | 'QUOTE' | string;
  visible_to?: 'BOTH' | 'CLIENT' | 'ARTIST' | string;

  // Content & preview
  content?: string | null;
  text?: string | null;                // normalized alias for content
  preview_label?: string | null;
  preview_key?: string | null;
  reply_to_message_id?: number | null;
  reply_to_preview?: string | null;

  // Attachments
  attachment_url?: string | null;
  attachment_meta?: Record<string, any> | null;

  // Reactions
  reactions?: Record<string, number>;
  my_reactions?: string[];

  // Status & state
  timestamp?: string;                  // ISO string
  is_read?: boolean;
  read_at?: string | null;
  is_delivered?: boolean;
  delivered_at?: string | null;

  // Client-only
  status?: 'queued' | 'sending' | 'failed' | 'sent';
  _upload_pct?: number;
  avatar_url?: string | null;
  quote_id?: number | null;
};

// Internal options
export type FetchMessagesOptions = {
  mode?: 'initial' | 'incremental';
  force?: boolean;
  reason?: string;
  limit?: number;
  behavior?: 'replace' | 'merge_update';
};

type HookOpts = {
  isActiveThread?: boolean;
  ensureQuotesLoaded?: (ids: number[]) => void | Promise<void>;
  onMessagesFetched?: (
    subset: ThreadMessage[],
    source: 'fetch' | 'older' | 'delta' | 'cache' | 'hydrate'
  ) => void;
};

// ----------------------------
// Utilities
// ----------------------------

function coerceString(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
}

function coerceTimestamp(value: unknown): number {
  if (!value) return 0;
  const d = typeof value === 'string' ? value : String(value);
  const ms = safeParseDate(d).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function toIso(value: unknown): string {
  const ms = coerceTimestamp(value);
  return ms > 0 ? new Date(ms).toISOString() : new Date(0).toISOString();
}

function normalizeForRender(raw: any): ThreadMessage {
  // Delegate to your shared normalizer, then ensure the UI has everything it needs.
  const n: any = normalizeShared(raw) ?? {};
  const id = Number(n.id);
  const ts = toIso(n.timestamp ?? n.created_at ?? n.updated_at);
  return {
    ...n,
    id: Number.isFinite(id) ? id : 0,
    text: n.text ?? n.content ?? '',
    timestamp: ts,
    reactions: n.reactions ?? {},
    my_reactions: Array.isArray(n.my_reactions) ? n.my_reactions : [],
    is_read: Boolean(n.is_read || n.read_at),
    is_delivered: Boolean(n.is_delivered || n.delivered_at),
  } as ThreadMessage;
}

function byChronoThenId(a: ThreadMessage, b: ThreadMessage): number {
  const at = coerceTimestamp(a.timestamp);
  const bt = coerceTimestamp(b.timestamp);
  if (at !== bt) return at - bt;
  return (a.id || 0) - (b.id || 0);
}

function mergeMessages(prev: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return prev;

  const map = new Map<number, ThreadMessage>();
  for (const m of prev) {
    if (m && Number.isFinite(m.id)) map.set(m.id, m);
  }
  for (const m of incoming) {
    if (!m || !Number.isFinite(m.id)) continue;
    const prior = map.get(m.id);
    if (!prior) {
      map.set(m.id, m);
      continue;
    }
    // Shallow merge but prefer newer truthy values; keep upload progress if present
    const merged: ThreadMessage = {
      ...prior,
      ...m,
      attachment_url: m.attachment_url ?? prior.attachment_url,
      _upload_pct: m._upload_pct ?? prior._upload_pct,
    };
    map.set(m.id, merged);
  }
  const out = Array.from(map.values());
  out.sort(byChronoThenId);
  return out;
}

// ----------------------------
// Hook: useThreadData
// ----------------------------

export function useThreadData(threadId: number, opts?: HookOpts) {
  const transport = useTransportState();
  const isActiveThread = opts?.isActiveThread !== false;

  // Synchronous cache seed for a stable first paint
  const [messages, setMessages] = React.useState<ThreadMessage[]>(() => {
    try {
      const cached = readCache(threadId);
      if (!Array.isArray(cached) || cached.length === 0) return [];
      return cached
        .map(normalizeForRender)
        .filter(m => Number.isFinite(m.id))
        .sort(byChronoThenId);
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = React.useState<boolean>(() => {
    try {
      const cached = readCache(threadId);
      return !(Array.isArray(cached) && cached.length > 0);
    } catch {
      return true;
    }
  });

  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [reachedHistoryStart, setReachedHistoryStart] = React.useState(false);

  // Refs
  const messagesRef = React.useRef<ThreadMessage[]>(messages);
  React.useEffect(() => { messagesRef.current = messages; }, [messages]);

  const fetchInFlightRef = React.useRef(false);
  const refetchRequestedRef = React.useRef<null | FetchMessagesOptions>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const initialLoadedRef = React.useRef<boolean>(messages.length > 0);
  const lastMessageIdRef = React.useRef<number | null>(
    messages.length ? Number(messages[messages.length - 1]?.id || 0) || null : null,
  );
  const missingThreadRef = React.useRef(false);

  // Merge ephemeral stubs (optimistic UI) and replace on real echo
  React.useEffect(() => {
    const applyStubs = () => {
      try {
        const stubs = getEphemeralStubs(threadId) || [];
        if (!Array.isArray(stubs) || stubs.length === 0) return;
        setMessages(prev => mergeMessages(prev, stubs.map(normalizeForRender)));
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

  // Async hydrate from cache if the first sync seed returned empty
  React.useEffect(() => {
    if (messagesRef.current.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const cached = readCache(threadId);
        if (cancelled || !Array.isArray(cached) || cached.length === 0) return;
        const normalized = cached.map(normalizeForRender).filter(m => Number.isFinite(m.id)).sort(byChronoThenId);
        if (normalized.length) {
          lastMessageIdRef.current = normalized[normalized.length - 1]?.id ?? null;
          setMessages(normalized);
          setLoading(false);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [threadId]);

  // Fetch messages (initial or incremental)
  const fetchMessages = React.useCallback(
    async (options: FetchMessagesOptions = {}) => {
      if (missingThreadRef.current) return;
      if (fetchInFlightRef.current) {
        refetchRequestedRef.current = { ...options };
        return;
      }
      if (!options.force && !isActiveThread) return;

      fetchInFlightRef.current = true;
      let mode: 'initial' | 'incremental' =
        options.mode ?? (messagesRef.current.length > 0 ? 'incremental' : 'initial');

      const lastId = Number(lastMessageIdRef.current || 0);
      const hasCursor = Number.isFinite(lastId) && lastId > 0;
      if (mode === 'incremental' && !hasCursor) mode = 'initial';
      if (mode === 'initial' && !initialLoadedRef.current) setLoading(true);

      const params: MessageListParams = {
        limit:
          options.limit != null
            ? options.limit
            : mode === 'initial' && !initialLoadedRef.current
              ? 50
              : 250,
      } as MessageListParams;

      if (mode === 'incremental' && hasCursor) {
        params.after_id = lastId;
        params.mode = 'delta' as any;
        params.fields = 'attachment_meta,reply_to_preview,quote_id,reactions,my_reactions';
        // Small deltas keep p95 low; server caps anyway
      } else {
        params.mode = 'lite' as any;
        params.fields = 'attachment_meta,reply_to_preview,quote_id,reactions,my_reactions';
      }

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
        // Abort previous request
        try { abortRef.current?.abort(); } catch {}
        abortRef.current = new AbortController();

        const res = await listMessages(threadId, params as any, { signal: abortRef.current.signal });

        // Seed any quoted items
        try {
          const qmap = (res.data as any)?.quotes as Record<number, any> | undefined;
          if (qmap && typeof qmap === 'object') seedGlobalQuotes(Object.values(qmap).filter(Boolean) as any);
        } catch {}

        // Normalize items for rendering
        const raw =
          Array.isArray((res.data as any)?.messages) ? (res.data as any).messages
            : Array.isArray((res.data as any)?.items) ? (res.data as any).items
            : Array.isArray(res.data) ? (res.data as any)
            : [];

        const normalized: ThreadMessage[] = raw
          .map(normalizeForRender)
          .filter(m => Number.isFinite(m.id) && m.id > 0);

        setMessages(prev => {
          const next = mergeMessages(prev, normalized);
          const last = next[next.length - 1];
          if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
          return next;
        });

        setLoading(false);
        initialLoadedRef.current = true;

        // has_more → reachedHistoryStart
        try {
          const serverMode = String(((res as any)?.data?.mode || params.mode || '')).toLowerCase();
          if (serverMode === 'lite' || serverMode === 'delta') {
            const hasMore = Boolean((res as any)?.data?.has_more);
            setReachedHistoryStart(!hasMore);
          }
        } catch {}

        try { opts?.onMessagesFetched?.(normalized, params.mode === 'delta' ? 'delta' : 'fetch'); } catch {}

        // Clear ephemeral stubs now that real data arrived
        try {
          clearEphemeralStubs(threadId);
          setMessages(prev => prev.filter(m => Number(m.id) > 0));
        } catch {}
      } catch (err) {
        // Ignore canceled fetch (thread switch)
        if (isAxiosError(err) && (err as any).code === 'ERR_CANCELED') {
          setLoading(false);
          return;
        }
        // 404: thread missing (or no access)
        if (isAxiosError(err) && err.response?.status === 404) {
          const had = (messagesRef.current?.length || 0) > 0;
          if (!had) {
            missingThreadRef.current = true;
            setMessages([]);
          }
          setLoading(false);
          return;
        }
        // 403: transient (auth refresh, race)
        if (isAxiosError(err) && err.response?.status === 403) {
          setLoading(false);
          queueRetry('transient');
          return;
        }
        // Transient / offline
        if (
          (isAxiosError(err) && (isTransientTransportError(err) || isOfflineError(err))) ||
          (!isAxiosError(err) && (isTransientTransportError(err as any) || isOfflineError(err as any)))
        ) {
          setLoading(false);
          queueRetry(isOfflineError(err as any) ? 'offline' : 'transient');
          return;
        }
        // Hard error
        // eslint-disable-next-line no-console
        console.error('Failed to fetch messages:', err);
        setLoading(false);
      } finally {
        fetchInFlightRef.current = false;
        try { abortRef.current = null; } catch {}
        const queued = refetchRequestedRef.current;
        refetchRequestedRef.current = null;
        if (queued) void fetchMessages({ mode: queued.mode ?? 'incremental', force: true, reason: queued.reason ?? 'queued-refetch' });
      }
    },
    [threadId, isActiveThread, transport.online, opts],
  );

  // Abort on unmount
  React.useEffect(() => () => { try { abortRef.current?.abort(); } catch {} }, []);

  // --- Public handlers ---

  const send = React.useCallback(
    async (payload: any, optsSend?: { idempotencyKey?: string; clientRequestId?: string }): Promise<ThreadMessage> => {
      const res = await postMessageToBookingRequest(threadId, payload, optsSend as any);
      return normalizeForRender(res.data);
    },
    [threadId],
  );

  const upload = React.useCallback(
    async (file: File, onProgress?: (pct: number) => void, signal?: AbortSignal) => {
      const res = await uploadMessageAttachment(
        threadId,
        file,
        (evt) => {
          if (onProgress && evt.total) {
            const pct = Math.round((evt.loaded * 100) / evt.total);
            onProgress(pct);
          }
        },
        signal,
      );
      return res.data; // { url, metadata }
    },
    [threadId],
  );

  const deleteMessage = React.useCallback(async (messageId: number) => {
    await deleteMessageForBookingRequest(threadId, messageId);
  }, [threadId]);

  // Reaction toggle (optimistic with single in-flight guard)
  const reactionInflightRef = React.useRef<Set<string>>(new Set());
  const reactToggle = React.useCallback(
    async (messageId: number, emoji: string, hasNow: boolean) => {
      const inflightKey = `${threadId}:${messageId}:${emoji}`;
      if (reactionInflightRef.current.has(inflightKey)) return;
      reactionInflightRef.current.add(inflightKey);

      const mutate = (reverse: boolean) => {
        setMessages(prev =>
          prev.map(m => {
            if (Number(m?.id) !== Number(messageId)) return m;
            const next: ThreadMessage = { ...m };
            const agg: Record<string, number> = { ...(m.reactions || {}) };
            const mine = new Set<string>(m.my_reactions || []);
            const doAdd = reverse ? hasNow : !hasNow;
            if (doAdd) {
              mine.add(emoji);
              agg[emoji] = Number(agg[emoji] || 0) + 1;
            } else {
              if (mine.has(emoji)) mine.delete(emoji);
              const curr = Number(agg[emoji] || 0) - 1;
              if (curr > 0) agg[emoji] = curr; else delete agg[emoji];
            }
            next.reactions = agg;
            next.my_reactions = Array.from(mine);
            return next;
          }),
        );
      };

      // optimistic apply
      mutate(false);
      const taskId = `reaction:${threadId}:${messageId}:${emoji}:${hasNow ? 'remove' : 'add'}`;

      try {
        const runner = async () => {
          if (hasNow) await removeMessageReaction(threadId, messageId, emoji);
          else await addMessageReaction(threadId, messageId, emoji);
        };
        const maybe = runWithTransport(taskId, runner, {
          metadata: { type: 'reaction', threadId, messageId, emoji, op: hasNow ? 'remove' : 'add' },
          onFailure: () => mutate(true), // revert
        });
        if (maybe && typeof (maybe as any).then === 'function') {
          await (maybe as Promise<void>);
        }
      } finally {
        reactionInflightRef.current.delete(inflightKey);
      }
    },
    [threadId],
  );

  // Correlate server echo → replace temp stub or merge fresh message
  const cidToTempRef = React.useRef<Map<string, number>>(new Map());
  const ingestExternalMessage = React.useCallback(
    (raw: any) => {
      if (!raw) return;
      const incoming = normalizeForRender(raw);
      if (!Number.isFinite(incoming.id) || incoming.id <= 0) return;

      const clientReqId = coerceString((raw.client_request_id ?? raw.clientRequestId) || '');
      if (clientReqId) {
        const tempId = cidToTempRef.current.get(clientReqId);
        if (Number.isFinite(tempId)) {
          setMessages(prev => {
            const withoutTemp = prev.filter(m => Number(m.id) !== Number(tempId));
            const already = withoutTemp.some(m => Number(m.id) === Number(incoming.id));
            const mergedList = already ? withoutTemp : mergeMessages(withoutTemp, [incoming]);
            const last = mergedList[mergedList.length - 1];
            if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
            return mergedList;
          });
          try { cidToTempRef.current.delete(clientReqId); } catch {}
          try { import('@/lib/chat/threadsEvents').then(({ emitThreadsUpdated }) => emitThreadsUpdated({ threadId, reason: 'message', immediate: true }, { immediate: true, force: true })); } catch {}
          return;
        }
      }

      // Merge normally (also preserves local upload preview if server echo lacks url)
      setMessages(prev => {
        const prior = prev.find(m => Number(m.id) === Number(incoming.id));
        let safeIncoming = incoming;
        if (prior && prior.attachment_url && !incoming.attachment_url) {
          safeIncoming = { ...incoming, attachment_url: prior.attachment_url, _upload_pct: (prior as any)._upload_pct };
        }
        const next = mergeMessages(prev, [safeIncoming]);
        const last = next[next.length - 1];
        if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
        return next;
      });
    },
    [threadId],
  );

  // Unified send with queue + retry via transport runner
  const sendWithQueue = React.useCallback(
    async (
      tempId: number,
      exec: () => Promise<ThreadMessage>,
      onSuccess: (real: ThreadMessage) => void,
      onFailure?: () => void,
      options?: { kind?: 'text' | 'voice' | 'file'; clientRequestId?: string },
    ) => {
      const kind = options?.kind || 'text';
      const clientRequestId = options?.clientRequestId && typeof options.clientRequestId === 'string'
        ? options.clientRequestId
        : undefined;

      if (clientRequestId && (kind === 'text' || kind === 'voice')) {
        try { cidToTempRef.current.set(clientRequestId, Number(tempId)); } catch {}
      }

      const taskId = `send:${threadId}:${Math.abs(Number(tempId) || Date.now())}`;

      const run = async () => {
        // mark sending just before attempt
        setMessages(prev => prev.map(m => (Number(m.id) === Number(tempId) ? { ...m, status: 'sending' } : m)));
        const real = await exec();
        onSuccess(real);
        if (clientRequestId) {
          try { cidToTempRef.current.delete(clientRequestId); } catch {}
        }
      };

      // Status while queued / online
      if (!transport.online) {
        setMessages(prev => prev.map(m => (Number(m.id) === Number(tempId) ? { ...m, status: 'queued' } : m)));
      } else {
        setMessages(prev => prev.map(m => (Number(m.id) === Number(tempId) ? { ...m, status: 'sending' } : m)));
      }

      runWithTransport(taskId, run, {
        metadata: { type: 'message-send', threadId, tempId, kind },
        onFailure: (err?: unknown) => {
          try { onFailure?.(); } catch {}
          if (kind === 'file') {
            setMessages(prev => prev.map(m => (Number(m.id) === Number(tempId) ? { ...m, status: 'failed' } : m)));
          } else {
            const meta = classifyTransportError(err);
            const hard4xx = meta.status && [401, 403, 404, 413, 422].includes(meta.status);
            setMessages(prev =>
              prev.map(m =>
                Number(m.id) === Number(tempId)
                  ? { ...m, status: hard4xx ? 'failed' : 'queued' }
                  : m,
              ),
            );
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

  const applyReadReceipt = React.useCallback(
    (upToId: number, readerId: number, myUserId?: number | null) => {
      if (!Number.isFinite(upToId) || myUserId == null || !Number.isFinite(myUserId)) return;
      // Flip only my messages (sent by me) up to upToId
      setMessages(prev =>
        prev.map(msg => {
          const fromMe = Number(msg?.sender_id) === Number(myUserId);
          if (!fromMe) return msg;
          if (!Number.isFinite(msg?.id) || Number(msg.id) > upToId) return msg;
          if (msg.read_at || msg.is_read) return msg;
          return {
            ...msg,
            is_read: true,
            read_at: msg.read_at || new Date().toISOString(),
          };
        }),
      );
    },
    [],
  );

  const applyDelivered = React.useCallback(
    (upToId: number, recipientId: number, myUserId?: number | null) => {
      if (!Number.isFinite(upToId) || myUserId == null || !Number.isFinite(myUserId)) return;
      setMessages(prev =>
        prev.map(msg => {
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
    },
    [],
  );

  // Older history paging
  const fetchOlder = React.useCallback(async () => {
    if (loadingOlder || reachedHistoryStart) return { added: 0 } as const;
    const list = messagesRef.current;
    if (!list || list.length === 0) return { added: 0 } as const;

    // Earliest positive id in current list
    let earliest: number | null = null;
    for (let i = 0; i < list.length; i += 1) {
      const id = Number(list[i]?.id);
      if (Number.isFinite(id) && id > 0) { earliest = id; break; }
    }
    if (!earliest || earliest <= 1) return { added: 0 } as const;

    setLoadingOlder(true);
    try {
      const res = await listMessages(threadId, {
        limit: 500,
        mode: 'lite' as any,
        before_id: earliest,
        fields: 'attachment_meta,reply_to_preview,quote_id,reactions,my_reactions',
      } as any);

      const rows = Array.isArray((res as any)?.data?.items) ? (res as any).data.items : [];
      if (!rows.length) {
        setReachedHistoryStart(true);
        return { added: 0 } as const;
      }

      const older = rows.map(normalizeForRender).filter(m => Number.isFinite(m.id) && m.id > 0);
      if (!older.length) return { added: 0 } as const;

      setMessages(prev => {
        const next = mergeMessages(older, prev);
        const last = next[next.length - 1];
        if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
        return next;
      });

      try {
        const qids = Array.from(new Set(older.map(m => Number(m.quote_id)).filter(n => Number.isFinite(n) && n > 0)));
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
  }, [threadId, loadingOlder, reachedHistoryStart, opts]);

  // Keep summary cache fresh for preview panes
  React.useEffect(() => {
    if (!threadId) return;
    if (!messages.length) {
      lastMessageIdRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    const lastId = Number(last?.id || 0);
    if (Number.isFinite(lastId)) lastMessageIdRef.current = lastId;

    const existing = (cacheGetSummaries() as any[]).find(s => Number(s?.id) === Number(threadId));
    const nextTimestamp = coerceTimestamp(last?.timestamp ?? new Date().toISOString());

    if (existing && Number((existing as any).last_message_id || 0) === lastId) {
      return;
    }
    if (existing) {
      const existingTimestamp = coerceTimestamp(
        (existing as any).last_message_timestamp || (existing as any).updated_at || (existing as any).created_at,
      );
      if (existingTimestamp > nextTimestamp) {
        return;
      }
    }

    // Prefer server preview label, else collapse booking-details boilerplate
    const rawPreviewLabel = coerceString((last as any)?.preview_label || '');
    const contentText = coerceString((last?.content ?? last?.text ?? '') as any);
    const collapsedPreview =
      rawPreviewLabel || (contentText.startsWith(BOOKING_DETAILS_PREFIX) ? 'New Booking Request' : contentText);

    try {
      const list = cacheGetSummaries() as any[];
      const nextList = list.map((s: any) =>
        Number(s?.id) === Number(threadId)
          ? {
              ...s,
              last_message_id: Number(last?.id || 0) || s.last_message_id || undefined,
              last_message_content: collapsedPreview,
              last_message_timestamp: last?.timestamp ?? new Date().toISOString(),
              last_sender_id: Number(last?.sender_id ?? (last as any)?.senderId ?? 0) || s.last_sender_id || undefined,
            }
          : s,
      );
      cacheSetSummaries(nextList as any);
    } catch {}
  }, [messages, threadId]);

  // Persist local cache after every merge
  React.useEffect(() => {
    try { writeCache(threadId, messages); } catch {}
  }, [messages, threadId]);

  return {
    messages,
    setMessages,
    loading,
    setLoading, // temporary escape hatch for legacy skeletons
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

// ----------------------------
// Realtime glue (kept colocated)
// ----------------------------

import { useEffect } from 'react';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';

type UseThreadRealtimeOptions = {
  threadId: number;
  isActive: boolean;
  myUserId: number;
  ingestMessage: (raw: any) => void;
  applyReadReceipt: (upToId: number, readerId: number, myUserId?: number | null) => void;
  applyReactionEvent?: (evt: { messageId: number; emoji: string; userId: number; kind: 'added' | 'removed' }) => void;
  applyMessageDeleted?: (messageId: number) => void;
  applyDelivered?: (upToId: number, recipientId: number, myUserId?: number | null) => void;
};

const THREAD_TOPIC_PREFIX = 'booking-requests:';

export function useThreadRealtime({
  threadId,
  isActive,
  myUserId,
  ingestMessage,
  applyReadReceipt,
  applyReactionEvent,
  applyMessageDeleted,
  applyDelivered,
}: UseThreadRealtimeOptions) {
  const { subscribe } = useRealtimeContext();

  // Prevent double-unread on fast echoes
  const seenIdsRef =
    typeof window !== 'undefined'
      ? ((window as any).__threadSeenIds ?? new Map<number, Set<number>>())
      : new Map<number, Set<number>>();
  if (typeof window !== 'undefined' && !(window as any).__threadSeenIds) {
    try { (window as any).__threadSeenIds = seenIdsRef; } catch {}
  }

  // Debounced delivered ack
  const deliveredMaxRef = React.useRef(0);
  const deliveredTimerRef = React.useRef<any>(0);

  useEffect(() => {
    if (!threadId || !isActive) return;
    const topic = `${THREAD_TOPIC_PREFIX}${threadId}`;

    let typingTimer: number | null = null;
    const scheduleTypingClear = () => {
      try { if (typingTimer != null) window.clearTimeout(typingTimer); } catch {}
      typingTimer = window.setTimeout(() => {
        try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
      }, 3000);
    };

    const unsubscribe = subscribe(topic, (evt: any) => {
      if (!evt) return;
      const type = evt.type;

      // Message / message_new (normalize envelope)
      if (!type || type === 'message' || type === 'message_new') {
        const raw = (evt?.payload && (evt.payload.message || evt.payload.data)) || evt.message || evt.data || evt;
        ingestMessage(raw);

        const senderId = Number(raw?.sender_id ?? raw?.senderId ?? 0);
        const mid = Number(raw?.id ?? 0);

        let seenSet = seenIdsRef.get(threadId);
        if (!seenSet) { seenSet = new Set<number>(); seenIdsRef.set(threadId, seenSet); }
        const isDuplicate = Number.isFinite(mid) && mid > 0 && seenSet.has(mid);

        if (Number.isFinite(senderId) && senderId > 0 && senderId !== myUserId) {
          if (!isDuplicate) {
            try {
              const list = cacheGetSummaries() as any[];
              const next = list.map(t => Number(t?.id) === threadId ? { ...t, unread_count: Math.max(0, Number(t?.unread_count || 0)) + 1 } : t);
              cacheSetSummaries(next as any);
            } catch {}
            if (Number.isFinite(mid) && mid > 0) {
              try {
                seenSet.add(mid);
                if (seenSet.size > 500) {
                  const half = Math.floor(seenSet.size / 2);
                  let i = 0; for (const v of seenSet) { seenSet.delete(v); if (++i >= half) break; }
                }
              } catch {}
            }
          }
          // Counterparty sent a message → not typing
          try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
        } else if (Number.isFinite(raw?.id)) {
          cacheSetLastRead(threadId, Number(raw?.id));
        }

        // Debounced delivered ack (client is active & visible)
        if (isActive && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (Number.isFinite(senderId) && senderId !== myUserId && Number.isFinite(mid) && mid > 0) {
            deliveredMaxRef.current = Math.max(deliveredMaxRef.current || 0, mid);
            try { if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current); } catch {}
            deliveredTimerRef.current = setTimeout(async () => {
              const up = deliveredMaxRef.current || 0;
              deliveredMaxRef.current = 0;
              if (up > 0) {
                try {
                  const mod = await import('@/lib/api');
                  await mod.putDeliveredUpTo(threadId, up);
                } catch {}
              }
            }, 150);
          }
        }
        return;
      }

      if (type === 'read') {
        const p = (evt?.payload || evt);
        const upToId = Number(p.up_to_id ?? p.last_read_id ?? p.message_id ?? 0);
        const readerId = Number(p.user_id ?? p.reader_id ?? 0);
        if (!Number.isFinite(upToId) || upToId <= 0 || !Number.isFinite(readerId) || readerId <= 0) return;
        if (readerId === myUserId) {
          cacheSetLastRead(threadId, upToId);
        } else {
          applyReadReceipt(upToId, readerId, myUserId);
        }
        return;
      }

      if (type === 'typing') {
        const p = (evt?.payload || evt);
        const users = Array.isArray(p.users) ? p.users : [];
        const typing = users.some((id: any) => Number(id) !== myUserId);
        cacheUpdateSummary(threadId, { typing });
        if (typing) scheduleTypingClear();
        return;
      }

      if (type === 'presence') {
        try {
          const p = (evt?.payload || evt);
          const updates = (p?.updates || {}) as Record<string, string>;
          // Pick first counterparty status
          for (const [uid, status] of Object.entries(updates)) {
            const id = Number(uid);
            if (!Number.isFinite(id) || id === myUserId) continue;
            cacheUpdateSummary(threadId, { presence: (status || '').toString(), last_presence_at: Date.now() });
            break;
          }
        } catch {}
        return;
      }

      if (type === 'delivered' && applyDelivered) {
        const p = (evt?.payload || evt);
        const upToId = Number(p.up_to_id ?? p.last_delivered_id ?? 0);
        const recipientId = Number(p.user_id ?? p.recipient_id ?? 0);
        if (Number.isFinite(upToId) && upToId > 0 && Number.isFinite(recipientId) && recipientId > 0) {
          try { applyDelivered(upToId, recipientId, myUserId); } catch {}
        }
        return;
      }

      if ((type === 'reaction_added' || type === 'reaction_removed') && applyReactionEvent) {
        try {
          const p = ((evt?.payload && (evt.payload.payload || evt.payload)) || evt.payload || evt) as any;
          const mid = Number(p?.message_id ?? 0);
          const userId = Number(p?.user_id ?? 0);
          const emoji = (p?.emoji || '').toString();
          if (Number.isFinite(userId) && userId === myUserId) return; // skip our own to avoid double-apply
          if (Number.isFinite(mid) && mid > 0 && emoji) {
            applyReactionEvent({ messageId: mid, emoji, userId, kind: type === 'reaction_added' ? 'added' : 'removed' });
          }
        } catch {}
        return;
      }

      if (type === 'message_deleted' && applyMessageDeleted) {
        const p = (evt?.payload || evt);
        const mid = Number(p?.id ?? p?.message_id ?? 0);
        if (Number.isFinite(mid) && mid > 0) {
          try { applyMessageDeleted(mid); } catch {}
        }
        return;
      }
    });

    return () => {
      try { if (typingTimer != null) window.clearTimeout(typingTimer); } catch {}
      unsubscribe();
    };
  }, [threadId, isActive, subscribe, ingestMessage, applyReadReceipt, myUserId, applyDelivered, applyReactionEvent, applyMessageDeleted]);
}
