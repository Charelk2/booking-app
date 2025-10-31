// components/chat/MessageThread/hooks/useThreadData.ts
// Centralized message lifecycle for a booking-request thread.
// Goals: perfect rendering & state coherency.
// - Stable ordering by (timestamp → id)
// - Normalized shape for UI (text, preview_label, reactions, etc.)
// - Ephemeral stubs merge instantly, then get replaced by server echoes
// - Delta fetch never drops local preview/progress (attachment_url/_upload_pct)
// - Reactions/read/delivered fully optimistic with safe rollback
// - Cache hydration + summaries kept in sync

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
  getMessagesForBookingRequest as apiList,
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
} from '@/lib/chat/threadCache';
import { safeParseDate } from '@/lib/chat/threadStore';
import { normalizeMessage as normalizeShared } from '@/lib/normalizers/messages';
import { getEphemeralStubs, clearEphemeralStubs } from '@/lib/chat/ephemeralStubs';

export type ThreadMessage = {
  id: number;

  booking_request_id?: number;
  sender_id?: number | null;
  sender_type?: 'CLIENT' | 'ARTIST' | 'SYSTEM' | string;
  message_type?: 'USER' | 'SYSTEM' | 'QUOTE' | string;
  visible_to?: 'BOTH' | 'CLIENT' | 'ARTIST' | string;

  // Core content
  content?: string | null;
  text?: string | null; // always present after normalization
  timestamp?: string; // ISO string — always present after normalization

  // Preview/replies
  preview_label?: string | null;
  preview_key?: string | null;
  reply_to_message_id?: number | null;
  reply_to_preview?: string | null;

  // Attachments
  attachment_url?: string | null;
  attachment_meta?: Record<string, any> | null;
  _upload_pct?: number; // client-only progress hint

  // Reactions
  reactions?: Record<string, number>;
  my_reactions?: string[];

  // Delivery states
  is_read?: boolean;
  read_at?: string | null;
  is_delivered?: boolean;
  delivered_at?: string | null;

  // Client-only status
  status?: 'queued' | 'sending' | 'failed' | 'sent';

  avatar_url?: string | null;
  quote_id?: number | null;
};

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
  onMessagesFetched?: (
    subset: ThreadMessage[],
    source: 'fetch' | 'older' | 'delta' | 'cache' | 'hydrate'
  ) => void;
};

// ---------- helpers ----------

const toIso = (v: unknown) => {
  const s = typeof v === 'string' ? v : v ? String(v) : '';
  const t = safeParseDate(s).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date(0).toISOString();
};

const tsNum = (v?: string) => {
  if (!v) return 0;
  const t = safeParseDate(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

const normalizeForRender = (raw: any): ThreadMessage => {
  const n: any = normalizeShared(raw) ?? {};
  const id = Number(n.id);
  const timestamp = toIso(n.timestamp ?? n.created_at ?? n.updated_at);
  const text = (n.text ?? n.content ?? '') as string;

  return {
    ...n,
    id: Number.isFinite(id) ? id : 0,
    timestamp,
    text,
    reactions: n.reactions ?? {},
    my_reactions: Array.isArray(n.my_reactions) ? n.my_reactions : [],
    is_read: Boolean(n.is_read || n.read_at),
    is_delivered: Boolean(n.is_delivered || n.delivered_at),
  } as ThreadMessage;
};

const sortChrono = (a: ThreadMessage, b: ThreadMessage) => {
  const at = tsNum(a.timestamp);
  const bt = tsNum(b.timestamp);
  if (at !== bt) return at - bt;
  return (a.id || 0) - (b.id || 0);
};

function mergeMessages(prev: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  if (!incoming?.length) return prev;
  const map = new Map<number, ThreadMessage>();
  for (const m of prev) if (m && Number.isFinite(m.id)) map.set(m.id, m);
  for (const m of incoming) {
    if (!m || !Number.isFinite(m.id)) continue;
    const prior = map.get(m.id);
    if (!prior) {
      map.set(m.id, m);
      continue;
    }
    // Keep any local-only hints (upload progress, temporary attachment preview)
    map.set(m.id, {
      ...prior,
      ...m,
      attachment_url: m.attachment_url ?? prior.attachment_url,
      _upload_pct: m._upload_pct ?? prior._upload_pct,
    });
  }
  const out = Array.from(map.values());
  out.sort(sortChrono);
  return out;
}

// ---------- hook ----------

export function useThreadData(threadId: number, opts?: HookOpts) {
  const isActiveThread = opts?.isActiveThread !== false;
  const transport = useTransportState();

  // Seed state from cache synchronously for stable first paint
  const [messages, setMessages] = React.useState<ThreadMessage[]>(() => {
    try {
      const cached = readCache(threadId);
      if (!Array.isArray(cached) || cached.length === 0) return [];
      return cached.map(normalizeForRender).filter(m => Number.isFinite(m.id)).sort(sortChrono);
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

  const messagesRef = React.useRef(messages);
  React.useEffect(() => { messagesRef.current = messages; }, [messages]);

  const fetchInFlightRef = React.useRef(false);
  const refetchRequestedRef = React.useRef<null | FetchMessagesOptions>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const initialLoadedRef = React.useRef<boolean>(messages.length > 0);
  const lastMessageIdRef = React.useRef<number | null>(
    messages.length ? Number(messages[messages.length - 1]?.id || 0) || null : null,
  );
  const missingThreadRef = React.useRef(false);

  // Reset history flags when thread changes
  React.useEffect(() => {
    setReachedHistoryStart(false);
    initialLoadedRef.current = messages.length > 0;
    lastMessageIdRef.current = messages.length ? messages[messages.length - 1]?.id ?? null : null;
  }, [threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge ephemeral stubs for instant render
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

  // Async hydrate from cache if initial mount was empty
  React.useEffect(() => {
    if (messagesRef.current.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const cached = readCache(threadId);
        if (cancelled || !Array.isArray(cached) || cached.length === 0) return;
        const normalized = cached.map(normalizeForRender).filter(m => Number.isFinite(m.id)).sort(sortChrono);
        if (normalized.length) {
          lastMessageIdRef.current = normalized[normalized.length - 1]?.id ?? null;
          setMessages(normalized);
          setLoading(false);
          try { opts?.onMessagesFetched?.(normalized, 'hydrate'); } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [threadId, opts]);

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
        try { abortRef.current?.abort(); } catch {}
        abortRef.current = new AbortController();

        const res = await apiList(threadId, params as any, { signal: abortRef.current.signal });

        // Seed quotes (best-effort)
        try {
          const qmap = (res.data as any)?.quotes as Record<number, any> | undefined;
          if (qmap && typeof qmap === 'object') seedGlobalQuotes(Object.values(qmap).filter(Boolean) as any);
        } catch {}

        const items =
          Array.isArray((res.data as any)?.messages) ? (res.data as any).messages
          : Array.isArray((res.data as any)?.items) ? (res.data as any).items
          : Array.isArray(res.data) ? (res.data as any)
          : [];

        const normalized = items.map(normalizeForRender).filter(m => Number.isFinite(m.id) && m.id > 0);

        setMessages(prev => {
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

        // Replace ephemeral stubs now that the real data arrived
        try {
          clearEphemeralStubs(threadId);
          setMessages(prev => prev.filter(m => Number(m.id) > 0));
        } catch {}
      } catch (err) {
        if (isAxiosError(err) && (err as any).code === 'ERR_CANCELED') {
          setLoading(false);
          return;
        }
        if (isAxiosError(err) && err.response?.status === 404) {
          const had = (messagesRef.current?.length || 0) > 0;
          if (!had) {
            missingThreadRef.current = true;
            setMessages([]);
          }
          setLoading(false);
          return;
        }
        if (isAxiosError(err) && err.response?.status === 403) {
          setLoading(false);
          queueRetry('transient');
          return;
        }
        if (
          (isAxiosError(err) && (isTransientTransportError(err) || isOfflineError(err))) ||
          (!isAxiosError(err) && (isTransientTransportError(err as any) || isOfflineError(err as any)))
        ) {
          setLoading(false);
          queueRetry(isOfflineError(err as any) ? 'offline' : 'transient');
          return;
        }
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

  // Abort on unmount to prevent stray merges
  React.useEffect(() => () => { try { abortRef.current?.abort(); } catch {} }, []);

  // ---- public handlers ----

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
        evt => {
          if (onProgress && evt.total) {
            const pct = Math.round((evt.loaded * 100) / evt.total);
            onProgress(pct);
          }
        },
        signal,
      );
      return res.data as { url: string; metadata?: Record<string, any> };
    },
    [threadId],
  );

  const deleteMessage = React.useCallback(async (messageId: number) => {
    await deleteMessageForBookingRequest(threadId, messageId);
  }, [threadId]);

  // Reaction toggle with optimistic UI + rollback on failure
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

      mutate(false);
      const taskId = `reaction:${threadId}:${messageId}:${emoji}:${hasNow ? 'remove' : 'add'}`;

      try {
        const runner = async () => {
          if (hasNow) await removeMessageReaction(threadId, messageId, emoji);
          else await addMessageReaction(threadId, messageId, emoji);
        };
        const p = runWithTransport(taskId, runner, {
          metadata: { type: 'reaction', threadId, messageId, emoji, op: hasNow ? 'remove' : 'add' },
          onFailure: () => mutate(true),
        });
        if (p && typeof (p as any).then === 'function') await (p as Promise<void>);
      } finally {
        reactionInflightRef.current.delete(inflightKey);
      }
    },
    [threadId],
  );

  // Apply a reaction event received from realtime (other user)
  const applyReactionEvent = React.useCallback((evt: { messageId: number; emoji: string; userId: number; kind: 'added' | 'removed' }) => {
    setMessages(prev =>
      prev.map(m => {
        if (Number(m.id) !== Number(evt.messageId)) return m;
        const agg: Record<string, number> = { ...(m.reactions || {}) };
        const count = Number(agg[evt.emoji] || 0);
        if (evt.kind === 'added') agg[evt.emoji] = count + 1;
        else {
          const next = count - 1;
          if (next > 0) agg[evt.emoji] = next; else delete agg[evt.emoji];
        }
        return { ...m, reactions: agg };
      }),
    );
  }, []);

  // Replace stub or merge incoming realtime message
  const cidToTempRef = React.useRef<Map<string, number>>(new Map());
  const ingestExternalMessage = React.useCallback((raw: any) => {
    if (!raw) return;
    const incoming = normalizeForRender(raw);
    if (!Number.isFinite(incoming.id) || incoming.id <= 0) return;

    const clientReqId = String((raw.client_request_id ?? raw.clientRequestId ?? '') || '');
    if (clientReqId) {
      const tempId = cidToTempRef.current.get(clientReqId);
      if (Number.isFinite(tempId)) {
        setMessages(prev => {
          const withoutTemp = prev.filter(m => Number(m.id) !== Number(tempId));
          const already = withoutTemp.some(m => Number(m.id) === Number(incoming.id));
          const merged = already ? withoutTemp : mergeMessages(withoutTemp, [incoming]);
          const last = merged[merged.length - 1];
          if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
          return merged;
        });
        try { cidToTempRef.current.delete(clientReqId); } catch {}
        try { import('@/lib/chat/threadsEvents').then(({ emitThreadsUpdated }) => emitThreadsUpdated({ threadId, reason: 'message', immediate: true }, { immediate: true, force: true })); } catch {}
        return;
      }
    }

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
  }, [threadId]);

  // Queue wrapper for send (offline retries, backoff, status transitions)
  const sendWithQueue = React.useCallback(
    async (
      tempId: number,
      exec: () => Promise<ThreadMessage>,
      onSuccess: (real: ThreadMessage) => void,
      onFailure?: () => void,
      options?: { kind?: 'text' | 'voice' | 'file'; clientRequestId?: string },
    ) => {
      const kind = options?.kind || 'text';
      const clientRequestId =
        options?.clientRequestId && typeof options.clientRequestId === 'string'
          ? options.clientRequestId
          : undefined;

      if (clientRequestId && (kind === 'text' || kind === 'voice')) {
        try { cidToTempRef.current.set(clientRequestId, Number(tempId)); } catch {}
      }

      const taskId = `send:${threadId}:${Math.abs(Number(tempId) || Date.now())}`;

      const run = async () => {
        setMessages(prev => prev.map(m => (Number(m.id) === Number(tempId) ? { ...m, status: 'sending' } : m)));
        const real = await exec();
        onSuccess(real);
        if (clientRequestId) { try { cidToTempRef.current.delete(clientRequestId); } catch {} }
      };

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
            setMessages(prev => prev.map(m =>
              Number(m.id) === Number(tempId) ? { ...m, status: hard4xx ? 'failed' : 'queued' } : m,
            ));
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
    setMessages(prev =>
      prev.map(msg => {
        if (Number(msg?.sender_id) !== Number(myUserId)) return msg;
        if (!Number.isFinite(msg?.id) || Number(msg.id) > upToId) return msg;
        if (msg.read_at || msg.is_read) return msg;
        return { ...msg, is_read: true, read_at: msg.read_at || new Date().toISOString() };
      }),
    );
  }, []);

  const applyDelivered = React.useCallback((upToId: number, recipientId: number, myUserId?: number | null) => {
    if (!Number.isFinite(upToId) || myUserId == null || !Number.isFinite(myUserId)) return;
    setMessages(prev =>
      prev.map(msg => {
        const fromMe = Number(msg?.sender_id) === Number(myUserId);
        if (!fromMe) return msg;
        if (!Number.isFinite(msg?.id) || Number(msg.id) > upToId) return msg;
        if (msg.is_read || msg.read_at) return msg;
        if (msg.is_delivered || msg.delivered_at) return msg;
        return { ...msg, is_delivered: true, delivered_at: msg.delivered_at || new Date().toISOString() };
      }),
    );
  }, []);

  // Older history
  const fetchOlder = React.useCallback(async () => {
    if (loadingOlder || reachedHistoryStart) return { added: 0 } as const;
    const list = messagesRef.current;
    if (!list || list.length === 0) return { added: 0 } as const;

    let earliest: number | null = null;
    for (let i = 0; i < list.length; i += 1) {
      const id = Number(list[i]?.id);
      if (Number.isFinite(id) && id > 0) { earliest = id; break; }
    }
    if (!earliest || earliest <= 1) return { added: 0 } as const;

    setLoadingOlder(true);
    try {
      const res = await apiList(threadId, {
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

  // Delete (applied from realtime)
  const applyMessageDeleted = React.useCallback((messageId: number) => {
    setMessages(prev => prev.filter(m => Number(m.id) !== Number(messageId)));
  }, []);

  // Update summaries cache for list previews
  React.useEffect(() => {
    if (!threadId || !messages.length) {
      if (!messages.length) lastMessageIdRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    const lastId = Number(last?.id || 0);
    if (Number.isFinite(lastId)) lastMessageIdRef.current = lastId;

    const list = cacheGetSummaries() as any[];
    const existing = list.find(s => Number(s?.id) === Number(threadId));
    const nextTimestamp = tsNum(last?.timestamp ?? new Date().toISOString());
    if (existing) {
      const existingTs = tsNum((existing as any).last_message_timestamp || (existing as any).updated_at || (existing as any).created_at);
      if (existingTs > nextTimestamp) return;
    }

    const previewLabel = String((last as any)?.preview_label || '');
    const contentText = String((last?.content ?? last?.text ?? '') || '');
    const collapsedPreview = previewLabel || (contentText.startsWith(BOOKING_DETAILS_PREFIX) ? 'New Booking Request' : contentText);

    try {
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

  // Persist per-thread cache
  React.useEffect(() => {
    try { writeCache(threadId, messages); } catch {}
  }, [messages, threadId]);

  return {
    messages,
    setMessages,
    loading,
    setLoading, // temporary (skeleton coordination)
    fetchMessages,
    fetchOlder,
    loadingOlder,
    reachedHistoryStart,
    handlers: {
      send,
      upload,
      deleteMessage,
      reactToggle,
      applyReactionEvent,
      ingestExternalMessage,
      applyReadReceipt,
      applyDelivered,
      applyMessageDeleted,
      sendWithQueue,
    },
  } as const;
}
