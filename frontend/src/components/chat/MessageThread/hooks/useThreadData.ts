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
import { normalizeMessage as normalizeGeneric } from '@/utils/messages';
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
  timestamp?: string; // ISO string - always present after normalization

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
  // Client correlation id for optimistic replace
  client_request_id?: string;
  pending?: boolean;

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
  /** Viewer role for visibility-aware preview updates: 'client' | 'service_provider' */
  viewerUserType?: string;
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
  // Use generic normalizer to ensure createdAt+text are always present
  const g = normalizeGeneric(raw);
  const n: any = { ...(normalizeShared(raw) ?? {}), text: g.text };
  const idNum = Number(n.id ?? g.id ?? 0);
  // Accept a wide range of timestamp keys from realtime/events
  let timestamp = toIso(
    g.createdAt
    ?? (n as any).timestamp
    ?? (n as any).created_at
    ?? (n as any).updated_at
    ?? (raw as any)?.created_at
    ?? (raw as any)?.updated_at
    ?? (raw as any)?.time
  );
  // If we still failed to resolve a sane timestamp (epoch fallback), prefer "now"
  // so the new message lands at the tail rather than floating to the top.
  try {
    const t = safeParseDate(timestamp).getTime();
    if (!Number.isFinite(t) || t <= 0) timestamp = new Date().toISOString();
  } catch { timestamp = new Date().toISOString(); }
  const clientReq = String(raw?.client_request_id ?? raw?.clientRequestId ?? g.clientId ?? '') || undefined;

  return {
    ...n,
    id: Number.isFinite(idNum) ? idNum : 0,
    timestamp,
    // Allow body/content fallback so slight backend diff doesn't drop the message.
    text: g.text ?? (n.content ?? (raw as any)?.body ?? null),
    reactions: n.reactions ?? {},
    my_reactions: Array.isArray(n.my_reactions) ? n.my_reactions : [],
    is_read: Boolean(n.is_read || n.read_at),
    is_delivered: Boolean(n.is_delivered || n.delivered_at),
    client_request_id: clientReq,
    pending: Boolean(raw?.pending || n.status === 'queued' || n.status === 'sending'),
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
  const byId = new Map<number, ThreadMessage>();
  const byClient = new Map<string, number>();
  const push = (m: ThreadMessage) => {
    if (!m || !Number.isFinite(m.id)) return;
    byId.set(m.id, m);
    const cid = (m as any)?.client_request_id as string | undefined;
    if (cid) byClient.set(cid, m.id);
  };
  for (const m of prev) push(m);
  for (const m of incoming) {
    if (!m) continue;
    const cid = (m as any)?.client_request_id as string | undefined;
    const existingId = Number.isFinite(m.id) ? m.id : (cid && byClient.get(cid)) || undefined;
    if (existingId && byId.has(existingId)) {
      const prior = byId.get(existingId)!;
      const merged: ThreadMessage = {
        ...prior,
        ...m,
        // Keep any local-only hints (upload progress, temporary attachment preview)
        attachment_url: m.attachment_url ?? prior.attachment_url,
        _upload_pct: (m as any)._upload_pct ?? (prior as any)._upload_pct,
        status: (m.status as any) || (prior.status as any),
        pending: false,
      } as any;
      byId.set(Number(merged.id) || existingId, merged);
      if (cid) byClient.set(cid, Number(merged.id) || existingId);
    } else if (Number.isFinite(m.id)) {
      byId.set(Number(m.id), m);
      if (cid) byClient.set(cid, Number(m.id));
    }
  }
  const out = Array.from(byId.values());
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
  const deltaCooldownRef = React.useRef<number>(0);

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

  // (moved below) - Listen for global delta pokes

  const fetchMessages = React.useCallback(
    async (options: FetchMessagesOptions = {}) => {
      if (missingThreadRef.current) return;
      if (fetchInFlightRef.current) {
        refetchRequestedRef.current = { ...options };
        return;
      }
      if (!options.force && !isActiveThread) return;

      fetchInFlightRef.current = true;

      // Disable delta/lite; always perform a full fetch.
      // Server caps non-delta pages to ~120 rows, so we chunk in full mode
      // until history is exhausted.
      const FULL_LIMIT = Math.min(options.limit != null ? options.limit : 120, 120);
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

        const normalized = items.map(normalizeForRender).filter((m: any) => Number.isFinite(m.id) && m.id > 0);

        setMessages(prev => {
          const next = mergeMessages(prev, normalized);
          const last = next[next.length - 1];
          if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
          return next;
        });

        setLoading(false);
        initialLoadedRef.current = true;

        // Exhaust older history in full mode using before_id paging
        let hasMoreFlag = false;
        try { hasMoreFlag = Boolean((res as any)?.data?.has_more); } catch { hasMoreFlag = false; }
        try { opts?.onMessagesFetched?.(normalized, 'fetch'); } catch {}

        if (hasMoreFlag) {
          // Walk older pages until no more; bounded by a generous guard
          let guard = 0;
          while (guard < 500) {
            guard += 1;
            const list = messagesRef.current || [];
            let earliest: number | null = null;
            for (let i = 0; i < list.length; i += 1) {
              const idn = Number((list[i] as any)?.id || 0);
              if (Number.isFinite(idn) && idn > 0) { earliest = idn; break; }
            }
            if (!earliest || earliest <= 1) break;
            try {
              const olderRes = await apiList(threadId, {
                limit: FULL_LIMIT,
                mode: 'full' as any,
                before_id: earliest,
                fields: 'attachment_meta,reply_to_preview,quote_id,reactions,my_reactions',
              } as any);
              const rows = Array.isArray((olderRes as any)?.data?.items) ? (olderRes as any).data.items : [];
              if (!rows.length) break;
              const older = rows.map(normalizeForRender).filter((m: any) => Number.isFinite(m.id) && m.id > 0);
              if (!older.length) break;
              setMessages((prev) => {
                const next = mergeMessages(older, prev);
                const last = next[next.length - 1];
                if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
                return next;
              });
              try { opts?.onMessagesFetched?.(older, 'fetch'); } catch {}
              const olderHasMore = Boolean((olderRes as any)?.data?.has_more);
              if (!olderHasMore) break;
            } catch {
              break;
            }
          }
          setReachedHistoryStart(true);
        } else {
          setReachedHistoryStart(true);
        }

        // Replace ephemeral stubs now that the real data arrived
        try {
          clearEphemeralStubs(threadId);
          setMessages(prev => prev.filter((m: any) => Number(m.id) > 0));
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

  // Lightweight delta reconcile after realtime events (best-effort)
  const fetchDelta = React.useCallback(async (reason: string = 'delta') => {
    try {
      const after = Number(lastMessageIdRef.current || 0);
      if (!Number.isFinite(after) || after <= 0) return;
      const now = Date.now();
      if (now < (deltaCooldownRef.current || 0)) return;
      deltaCooldownRef.current = now + 600; // throttle
      const res = await apiList(threadId, {
        limit: 100,
        mode: 'delta' as any,
        after_id: after,
        fields: 'attachment_meta,reply_to_preview,quote_id,reactions,my_reactions',
      } as any);
      const rows = Array.isArray((res as any)?.data?.items) ? (res as any).data.items : [];
      if (!rows.length) return;
      const newer = rows.map(normalizeForRender).filter((m: any) => Number.isFinite(m.id) && m.id > 0);
      if (!newer.length) return;
      setMessages((prev) => {
        const next = mergeMessages(prev, newer);
        const last = next[next.length - 1];
        if (Number.isFinite(last?.id)) lastMessageIdRef.current = Number(last.id);
        return next;
      });
    } catch {
      // swallow - delta is best-effort
    }
  }, [threadId]);

  // Listen for global delta pokes (e.g., notifications) and reconcile when it targets this thread
  React.useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent<{ threadId?: number }>).detail || {};
        if (Number(detail.threadId) !== Number(threadId)) return;
        void fetchDelta('poked');
      } catch {}
    };
    if (typeof window !== 'undefined') window.addEventListener('thread:pokedelta', handler as any);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('thread:pokedelta', handler as any); };
  }, [threadId, fetchDelta]);

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
      // Monotonic tail boost: if this is a strictly newer id than anything we have,
      // ensure its timestamp does not sort before the current tail. This makes the
      // newest message appear at the bottom instantly even if the server timestamp
      // is stale or rounded.
      try {
        const prevMaxId = prev.reduce((m, msg) => {
          const idn = Number((msg as any)?.id || 0);
          return Number.isFinite(idn) && idn > m ? idn : m;
        }, 0);
        const incomingId = Number((safeIncoming as any)?.id || 0);
        if (Number.isFinite(incomingId) && incomingId > prevMaxId) {
          const tailTs = (() => {
            try { return tsNum((prev[prev.length - 1] as any)?.timestamp || undefined); } catch { return 0; }
          })();
          const incTs = tsNum((safeIncoming as any)?.timestamp || undefined);
          if (!Number.isFinite(incTs) || incTs <= tailTs) {
            const bump = Math.max(Date.now(), tailTs + 1);
            safeIncoming = { ...safeIncoming, timestamp: new Date(bump).toISOString() } as any;
          }
        }
      } catch {}

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
    // Disabled older-page loading: full history is fetched upfront
    setReachedHistoryStart(true);
    return { added: 0 } as const;
  }, []);

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
    // Choose the latest message visible to the current viewer for preview updates
    const viewerRole = String(opts?.viewerUserType || 'client').toLowerCase();
    const visible = messages.filter(m => {
      const vt = String((m as any)?.visible_to ?? 'both').toLowerCase();
      if (vt === 'both') return true;
      if (viewerRole === 'service_provider') return vt === 'service_provider';
      return vt === 'client';
    });
    const last = visible.length ? visible[visible.length - 1] : messages[messages.length - 1];
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
    const lowText = contentText.toLowerCase();
    let collapsedPreview = previewLabel;
    if (!collapsedPreview) {
      if (contentText.startsWith(BOOKING_DETAILS_PREFIX)) {
        collapsedPreview = 'New Booking Request';
      } else if (lowText.startsWith('payment received')) {
        collapsedPreview = 'Payment received';
      } else {
        collapsedPreview = contentText;
      }
    }

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
    fetchDelta,
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
