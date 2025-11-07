import { useEffect, useRef } from 'react';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';
import {
  getSummaries as cacheGetSummaries,
  setSummaries as cacheSetSummaries,
  setLastRead as cacheSetLastRead,
  updateSummary as cacheUpdateSummary,
} from '@/lib/chat/threadCache';
import { threadStore } from '@/lib/chat/threadStore';

type SenderType = 'CLIENT' | 'AGENT';

type UseThreadRealtimeOptions = {
  threadId: number;
  isActive: boolean;
  myUserId: number;
  myUserType: SenderType; // kept for future use; not required with no synthetic ingest
  ingestMessage: (raw: any) => void;
  applyReadReceipt: (upToId: number, readerId: number, myUserId?: number | null) => void;
  applyReactionEvent?: (evt: { messageId: number; emoji: string; userId: number; kind: 'added' | 'removed' }) => void;
  applyMessageDeleted?: (messageId: number) => void;
  applyDelivered?: (upToId: number, recipientId: number, myUserId?: number | null) => void;
  pokeDelta?: (reason?: string) => void;
};

const THREAD_TOPIC_PREFIX = 'booking-requests:';
const MAX_SEEN_IDS = 500;

// Shared map of seen message IDs per thread (cross-hook-instance)
const getSeenMap = (function () {
  var map = null as Map<number, Set<number>> | null;
  return function () {
    if (!map) map = new Map();
    return map;
  };
})();

function useSyncRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(function () {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useThreadRealtime({
  threadId,
  isActive,
  myUserId,
  myUserType, // eslint-disable-line @typescript-eslint/no-unused-vars
  ingestMessage,
  applyReadReceipt,
  applyReactionEvent,
  applyMessageDeleted,
  applyDelivered,
  pokeDelta,
}: UseThreadRealtimeOptions) {
  const { subscribe } = useRealtimeContext();

  // ES5-safe refs & timers
  const seenIdsRef = useRef<Map<number, Set<number>>>(getSeenMap());
  const deliveredMaxRef = useRef(0);
  const deliveredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs to avoid stale closures or re-subscribe churn
  const myUserIdRef = useSyncRef(myUserId);
  const ingestMessageRef = useSyncRef(ingestMessage);
  const applyReadReceiptRef = useSyncRef(applyReadReceipt);
  const applyReactionEventRef = useSyncRef(applyReactionEvent);
  const applyMessageDeletedRef = useSyncRef(applyMessageDeleted);
  const applyDeliveredRef = useSyncRef(applyDelivered);
  const pokeDeltaRef = useSyncRef(pokeDelta);

  useEffect(function () {
    if (!threadId || !isActive) return;

    const topic = THREAD_TOPIC_PREFIX + String(threadId);

    function clearTypingTimer() {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    }

    function scheduleTypingClear() {
      clearTypingTimer();
      typingTimerRef.current = setTimeout(function () {
        try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
      }, 3000);
    }

    function onMessageLike(evt: any) {
      // Normalize payload to a message-like object
      const raw = (evt && evt.payload && (evt.payload.message || evt.payload.data)) || evt.message || evt.data || evt;
      const mid = Number(raw && raw.id || 0);
      const senderId = Number((raw && (raw.sender_id != null ? raw.sender_id : raw.senderId)) || 0);

      // ES5-safe dedup before ingest (prevents double bubbles on reconnects / repeats)
      if (mid > 0) {
        let setForThread = seenIdsRef.current.get(threadId);
        if (!setForThread) {
          setForThread = new Set<number>();
          seenIdsRef.current.set(threadId, setForThread);
        }
        if (setForThread.has(mid)) {
          // already processed this message id → skip
        } else {
          setForThread.add(mid);
          // cap memory: drop oldest half when exceeding limit
          if (setForThread.size > MAX_SEEN_IDS) {
            var arr = Array.from(setForThread);
            setForThread.clear();
            for (var i = Math.floor(arr.length / 2); i < arr.length; i++) setForThread.add(arr[i]);
          }
          // Only ingest when not seen
          try { ingestMessageRef.current && ingestMessageRef.current(raw); } catch (e) { try { console.warn('[realtime] ingest failed', e); } catch {} }
        }
      } else {
        // No id → best-effort ingest (rare)
        try { ingestMessageRef.current && ingestMessageRef.current(raw); } catch {}
      }

      // Tiny reconcile nudge for UI parity
      try { setTimeout(function () { pokeDeltaRef.current && pokeDeltaRef.current('post-ws-message'); }, 120); } catch {}

      // Update unread & typing hints
      if (senderId && mid && senderId !== myUserIdRef.current) {
        try {
          const summaries = cacheGetSummaries() as any[];
          const updated = summaries.map(function (t: any) {
            return Number(t && t.id) === threadId
              ? { ...t, unread_count: Math.max(0, Number(t && t.unread_count || 0)) + 1 }
              : t;
          });
          cacheSetSummaries(updated);
        } catch {}
        try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
      } else if (mid) {
        // Our own message → keep last read high-water mark locally
        try { cacheSetLastRead(threadId, mid); } catch {}
      }

      // Debounced delivered ACK (only when visible + recipient)
      if (
        isActive &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        senderId !== myUserIdRef.current &&
        mid > 0
      ) {
        deliveredMaxRef.current = Math.max(deliveredMaxRef.current, mid);
        if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current);
        deliveredTimerRef.current = setTimeout(function () {
          const up = deliveredMaxRef.current;
          deliveredMaxRef.current = 0;
          if (up > 0) {
            (async function () {
              try {
                const mod = await import('@/lib/api');
                await mod.putDeliveredUpTo(threadId, up);
              } catch (e) {
                try { console.warn('[realtime] PUT delivered failed', e); } catch {}
              }
            })();
          }
        }, 150);
      }
    }

    function onEvent(evt: any) {
      if (!evt) return;
      const type = String(evt.type || '').toLowerCase();
      const payload = evt.payload || evt;

      // Message-like events
      if (!type || type === 'message' || type === 'message_new') {
        onMessageLike(evt);
        return;
      }

      if (type === 'read') {
        const upToId = Number(payload.up_to_id || payload.last_read_id || payload.message_id || 0);
        const readerId = Number(payload.user_id || payload.reader_id || 0);
        if (!upToId || !readerId) return;
        if (readerId === myUserIdRef.current) {
          try { cacheSetLastRead(threadId, upToId); } catch {}
        } else {
          try { applyReadReceiptRef.current && applyReadReceiptRef.current(upToId, readerId, myUserIdRef.current); } catch {}
        }
        return;
      }

      if (type === 'typing') {
        const users = Array.isArray(payload.users) ? payload.users : [];
        const typing = users.some(function (id: number | string) { return Number(id) !== myUserIdRef.current; });
        try { cacheUpdateSummary(threadId, { typing: typing }); } catch {}
        if (typing) scheduleTypingClear();
        return;
      }

      if (type === 'presence') {
        const updates = payload && payload.updates ? payload.updates : {};
        // Pick first counterparty status
        const entries = Object.entries(updates);
        for (var i = 0; i < entries.length; i++) {
          const pair = entries[i];
          const uid = pair[0];
          const status = pair[1] as unknown;
          const id = Number(uid);
          if (!Number.isFinite(id) || id === myUserIdRef.current) continue;
          try {
            cacheUpdateSummary(threadId, {
              presence: String(status == null ? '' : status),
              last_presence_at: Date.now(),
            });
          } catch {}
          break;
        }
        return;
      }

      if (type === 'delivered' && applyDeliveredRef.current) {
        const upToId = Number(payload.up_to_id || payload.last_delivered_id || 0);
        const recipientId = Number(payload.user_id || payload.recipient_id || 0);
        if (upToId && recipientId) {
          try { applyDeliveredRef.current(upToId, recipientId, myUserIdRef.current); } catch {}
        }
        return;
      }

      if ((type === 'reaction_added' || type === 'reaction_removed') && applyReactionEventRef.current) {
        const p = (payload && payload.payload) || payload;
        const mid = Number(p && p.message_id || 0);
        const userId = Number(p && p.user_id || 0);
        const emoji = p && p.emoji != null ? String(p.emoji) : '';
        if (userId !== myUserIdRef.current && mid && emoji) {
          try {
            applyReactionEventRef.current({
              messageId: mid,
              emoji: emoji,
              userId: userId,
              kind: type === 'reaction_added' ? 'added' : 'removed',
            });
          } catch {}
        }
        return;
      }

      if (type === 'message_deleted' && applyMessageDeletedRef.current) {
        const mid = Number((payload && (payload.id || payload.message_id)) || 0);
        if (mid) try { applyMessageDeletedRef.current(mid); } catch {}
        return;
      }

      if (type === 'thread_tail') {
        // ⚠️ DO NOT inject a synthetic bubble (prevents duplicates and flip)
        const tid = Number((payload && (payload.thread_id != null ? payload.thread_id : threadId)) || threadId);
        const lastId = Number((payload && payload.last_id) || 0);
        const lastTs = (payload && payload.last_ts) || null;
        const snippet = (payload && payload.snippet ? String(payload.snippet) : '').trim();
        var preview = snippet;
        if (preview.toLowerCase().indexOf('payment received') === 0) preview = 'Payment received';

        if (tid === threadId) {
          try {
            threadStore.update(tid, {
              id: tid,
              last_message_id: lastId || undefined,
              last_message_timestamp: lastTs || undefined,
              last_message_content: preview || undefined,
            });
          } catch {}
          try { pokeDeltaRef.current && pokeDeltaRef.current('thread_tail'); } catch {}
        }
        return;
      }
    }

    const unsubscribe = subscribe(topic, onEvent);

    return function cleanup() {
      clearTypingTimer();
      if (deliveredTimerRef.current) {
        clearTimeout(deliveredTimerRef.current);
        deliveredTimerRef.current = null;
      }
      try { unsubscribe && unsubscribe(); } catch {}
    };
  }, [threadId, isActive, subscribe]);
}
