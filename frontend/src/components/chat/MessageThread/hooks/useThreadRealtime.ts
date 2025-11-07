import { useEffect, useRef } from 'react';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';
import {
  getSummaries as cacheGetSummaries,
  setSummaries as cacheSetSummaries,
  setLastRead as cacheSetLastRead,
  updateSummary as cacheUpdateSummary,
} from '@/lib/chat/threadCache';
import { threadStore } from '@/lib/chat/threadStore';

type UseThreadRealtimeOptions = {
  threadId: number;
  isActive: boolean;
  myUserId: number;
  ingestMessage: (raw: any) => void;
  applyReadReceipt: (upToId: number, readerId: number, myUserId?: number | null) => void;
  applyReactionEvent?: (evt: { messageId: number; emoji: string; userId: number; kind: 'added' | 'removed' }) => void;
  applyMessageDeleted?: (messageId: number) => void;
  applyDelivered?: (upToId: number, recipientId: number, myUserId?: number | null) => void;
  pokeDelta?: (reason?: string) => void;
};

const THREAD_TOPIC_PREFIX = 'booking-requests:';
const MAX_SEEN_IDS = 500;

// Lazy init shared memory-safe map for deduplication
const getSeenMap = (() => {
  let map: Map<number, Set<number>> | null = null;
  return () => {
    if (!map) map = new Map();
    return map;
  };
})();

export function useThreadRealtime({
  threadId,
  isActive,
  myUserId,
  ingestMessage,
  applyReadReceipt,
  applyReactionEvent,
  applyMessageDeleted,
  applyDelivered,
  pokeDelta,
}: UseThreadRealtimeOptions) {
  const { subscribe } = useRealtimeContext();
  const seenIdsRef = useRef<Map<number, Set<number>>>(getSeenMap());
  const deliveredMaxRef = useRef(0);
  const deliveredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!threadId || !isActive) return;

    const topic = `${THREAD_TOPIC_PREFIX}${threadId}`;

    const clearTypingTimer = () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };

    const scheduleTypingClear = () => {
      clearTypingTimer();
      typingTimerRef.current = setTimeout(() => {
        cacheUpdateSummary(threadId, { typing: false });
      }, 3000);
    };

    const onEvent = (evt: any) => {
      if (!evt) return;

      const type = evt.type;
      const payload = evt.payload || evt;

      // Normalize message structure
      const normalizeMessage = (e: any) =>
        (e?.payload && (e.payload.message || e.payload.data)) || e.message || e.data || e;

      if (!type || type === 'message' || type === 'message_new') {
        const raw = normalizeMessage(evt);

        try {
          ingestMessage(raw);
        } catch (e) {
          console.warn('[realtime] ingest failed', e, {
            keys: raw && typeof raw === 'object' ? Object.keys(raw) : [],
          });
        }

        setTimeout(() => pokeDelta?.('post-ws-message'), 140);

        const senderId = Number(raw?.sender_id ?? raw?.senderId ?? 0);
        const mid = Number(raw?.id ?? 0);

        if (senderId && mid && senderId !== myUserId) {
          let seenSet = seenIdsRef.current.get(threadId);
          if (!seenSet) {
            seenSet = new Set<number>();
            seenIdsRef.current.set(threadId, seenSet);
          }

          const isDuplicate = seenSet.has(mid);

          if (!isDuplicate) {
            seenSet.add(mid);
            if (seenSet.size > MAX_SEEN_IDS) {
              const entries = Array.from(seenSet);
              seenSet.clear();
              for (let i = MAX_SEEN_IDS / 2; i < entries.length; i++) {
                seenSet.add(entries[i]);
              }
            }

            try {
              const summaries = cacheGetSummaries() as any[];
              const updated = summaries.map((t) =>
                Number(t?.id) === threadId
                  ? { ...t, unread_count: Math.max(0, Number(t?.unread_count || 0)) + 1 }
                  : t
              );
              cacheSetSummaries(updated as any[]);
            } catch {}
          }

          cacheUpdateSummary(threadId, { typing: false });
        } else if (mid) {
          cacheSetLastRead(threadId, mid);
        }

        // Debounce delivered PUT if visible
        if (
          isActive &&
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible' &&
          senderId !== myUserId &&
          mid > 0
        ) {
          deliveredMaxRef.current = Math.max(deliveredMaxRef.current, mid);

          if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current);

          deliveredTimerRef.current = setTimeout(async () => {
            const up = deliveredMaxRef.current;
            deliveredMaxRef.current = 0;
            try {
              const mod = await import('@/lib/api');
              await mod.putDeliveredUpTo(threadId, up);
            } catch (e) {
              console.warn('[realtime] failed to PUT delivered', e);
            }
          }, 150);
        }

        return;
      }

      if (type === 'read') {
        const upToId = Number(payload.up_to_id ?? payload.last_read_id ?? payload.message_id ?? 0);
        const readerId = Number(payload.user_id ?? payload.reader_id ?? 0);
        if (!upToId || !readerId) return;

        if (readerId === myUserId) {
          cacheSetLastRead(threadId, upToId);
        } else {
          applyReadReceipt(upToId, readerId, myUserId);
        }
        return;
      }

      if (type === 'typing') {
        const users = Array.isArray(payload.users) ? payload.users : [];
        const typing = users.some((id: number | string) => Number(id) !== myUserId);
        cacheUpdateSummary(threadId, { typing });
        if (typing) scheduleTypingClear();
        return;
      }

      if (type === 'presence') {
        const updates = payload?.updates || {};
        for (const [uid, status] of Object.entries(updates)) {
          const id = Number(uid);
          if (!Number.isFinite(id) || id === myUserId) continue;

          cacheUpdateSummary(threadId, {
            presence: String(status ?? ''),
            last_presence_at: Date.now(),
          });
          break;
        }
        return;
      }

      if (type === 'delivered' && applyDelivered) {
        const upToId = Number(payload.up_to_id ?? payload.last_delivered_id ?? 0);
        const recipientId = Number(payload.user_id ?? payload.recipient_id ?? 0);
        if (upToId && recipientId) {
          applyDelivered(upToId, recipientId, myUserId);
        }
        return;
      }

      if ((type === 'reaction_added' || type === 'reaction_removed') && applyReactionEvent) {
        const p = payload?.payload || payload;
        const mid = Number(p?.message_id ?? 0);
        const userId = Number(p?.user_id ?? 0);
        const emoji = p?.emoji?.toString();

        if (userId !== myUserId && mid && emoji) {
          applyReactionEvent({
            messageId: mid,
            emoji,
            userId,
            kind: type === 'reaction_added' ? 'added' : 'removed',
          });
        }
        return;
      }

      if (type === 'message_deleted' && applyMessageDeleted) {
        const mid = Number(payload?.id ?? payload?.message_id ?? 0);
        if (mid) applyMessageDeleted(mid);
        return;
      }

      if (type === 'thread_tail') {
        const tid = Number(payload?.thread_id ?? threadId);
        const lastId = Number(payload?.last_id ?? 0);
        const lastTs = payload?.last_ts ?? null;
        const snippet = String(payload?.snippet ?? '').trim();
        const low = snippet.toLowerCase();

        let preview = snippet;
        if (low.startsWith('payment received')) {
          preview = 'Payment received';
        }

        if (tid === threadId) {
          threadStore.update(tid, {
            id: tid,
            last_message_id: lastId || undefined,
            last_message_timestamp: lastTs || undefined,
            last_message_content: preview || undefined,
          });

          const isNewRequest =
            low.startsWith('booking details:') ||
            low.includes('new booking request') ||
            low.includes('you have a new booking request');

          if (!isNewRequest && lastId > 0) {
            ingestMessage({
              id: lastId,
              booking_request_id: tid,
              sender_id: 0,
              sender_type: 'CLIENT',
              content: snippet,
              message_type: 'USER',
              timestamp: lastTs || new Date().toISOString(),
              _synthetic_preview: true,
            });
          }

          pokeDelta?.('thread_tail');
        }
        return;
      }
    };

    const unsubscribe = subscribe(topic, onEvent);

    return () => {
      clearTypingTimer();
      if (deliveredTimerRef.current) {
        clearTimeout(deliveredTimerRef.current);
        deliveredTimerRef.current = null;
      }
      unsubscribe();
    };
  }, [
    threadId,
    isActive,
    myUserId,
    subscribe,
    ingestMessage,
    applyReadReceipt,
    applyDelivered,
    applyReactionEvent,
    applyMessageDeleted,
    pokeDelta,
  ]);
}
