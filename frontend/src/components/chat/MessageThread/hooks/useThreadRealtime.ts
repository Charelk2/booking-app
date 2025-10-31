// components/chat/MessageThread/hooks/useThreadRealtime.ts
// Realtime glue for a single thread (topic: booking-requests:{id})
// Handles: message echoes, typing, presence, read receipts, delivered,
// reactions, and deletions.

import { useEffect, useRef } from 'react';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';
import {
  getSummaries as cacheGetSummaries,
  setSummaries as cacheSetSummaries,
  setLastRead as cacheSetLastRead,
  updateSummary as cacheUpdateSummary,
} from '@/lib/chat/threadCache';

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

  // Dedup fast echoes → avoid double-unread
  const seenIdsRef =
    typeof window !== 'undefined'
      ? ((window as any).__threadSeenIds ?? new Map<number, Set<number>>())
      : new Map<number, Set<number>>();
  if (typeof window !== 'undefined' && !(window as any).__threadSeenIds) {
    try { (window as any).__threadSeenIds = seenIdsRef; } catch {}
  }

  // Debounced delivered ack state
  const deliveredMaxRef = useRef(0);
  const deliveredTimerRef = useRef<any>(0);

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

      // Messages (legacy & new envelopes)
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
              const next = list.map(t =>
                Number(t?.id) === threadId
                  ? { ...t, unread_count: Math.max(0, Number(t?.unread_count || 0)) + 1 }
                  : t,
              );
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
          // Counterparty sent a message → they aren't typing anymore
          try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
        } else if (Number.isFinite(raw?.id)) {
          cacheSetLastRead(threadId, Number(raw?.id));
        }

        // Debounced delivered ack up to this id
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
          if (Number.isFinite(userId) && userId === myUserId) return; // we'll already be optimistic locally
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
