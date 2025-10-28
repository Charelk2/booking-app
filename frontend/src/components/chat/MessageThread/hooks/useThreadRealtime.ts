import { useEffect } from 'react';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';
import { getSummaries as cacheGetSummaries, setSummaries as cacheSetSummaries, setLastRead as cacheSetLastRead, updateSummary as cacheUpdateSummary } from '@/lib/chat/threadCache';

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
  const seenIdsRef = (typeof window !== 'undefined') ? (window as any).__threadSeenIds ?? new Map<number, Set<number>>() : new Map<number, Set<number>>();
  if (typeof window !== 'undefined' && !(window as any).__threadSeenIds) {
    try { (window as any).__threadSeenIds = seenIdsRef; } catch {}
  }
  // Debounced delivered ack state
  const deliveredMaxRef = { current: 0 } as { current: number };
  const deliveredTimerRef = { current: 0 as any } as { current: any };

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
    const unsubscribe = subscribe(topic, (payload: any) => {
      if (!payload) return;
      const type = payload.type;

      if (!type || type === 'message' || type === 'message_new' || payload.id) {
        ingestMessage(payload);
        const senderId = Number(payload?.sender_id ?? payload?.senderId ?? 0);
        const mid = Number(payload?.id ?? 0);
        // Deduplicate by message id to avoid double unread on fast+reliable deliveries
        let seenSet = seenIdsRef.get(threadId);
        if (!seenSet) { seenSet = new Set<number>(); seenIdsRef.set(threadId, seenSet); }
        const isDuplicate = Number.isFinite(mid) && mid > 0 && seenSet.has(mid);
        if (Number.isFinite(senderId) && senderId > 0 && senderId !== myUserId) {
          if (!isDuplicate) {
            try {
              const list = cacheGetSummaries() as any[];
              const next = list.map((t) => Number(t?.id) === threadId ? { ...t, unread_count: Math.max(0, Number(t?.unread_count || 0)) + 1 } : t);
              cacheSetSummaries(next as any);
            } catch {}
            if (Number.isFinite(mid) && mid > 0) {
              try {
                seenSet.add(mid);
                // Simple cap to avoid unbounded growth
                if (seenSet.size > 500) {
                  // Drop oldest half (best-effort; Set iteration order is insertion order in modern engines)
                  const half = Math.floor(seenSet.size / 2);
                  let i = 0; for (const v of seenSet) { seenSet.delete(v); if (++i >= half) break; }
                }
              } catch {}
            }
          }
          // Counterparty sent a message: they are no longer typing
          try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
        } else if (Number.isFinite(payload?.id)) {
          cacheSetLastRead(threadId, Number(payload?.id));
        }
        // Delivered ack: if we are the recipient, visible and active, debounce a PUT
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
        const upToId = Number(payload.up_to_id ?? payload.last_read_id ?? payload.message_id ?? 0);
        const readerId = Number(payload.user_id ?? payload.reader_id ?? 0);
        if (!Number.isFinite(upToId) || upToId <= 0 || !Number.isFinite(readerId) || readerId <= 0) return;
        if (readerId === myUserId) {
          cacheSetLastRead(threadId, upToId);
        } else {
          applyReadReceipt(upToId, readerId, myUserId);
        }
        return;
      }

      if (type === 'typing') {
        const users = Array.isArray(payload.users) ? payload.users : [];
        const typing = users.some((id: any) => Number(id) !== myUserId);
        cacheUpdateSummary(threadId, { typing });
        if (typing) scheduleTypingClear();
        return;
      }

      if (type === 'presence') {
        try {
          const updates = (payload?.updates || {}) as Record<string, string>;
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
        const upToId = Number(payload.up_to_id ?? payload.last_delivered_id ?? 0);
        const recipientId = Number(payload.user_id ?? payload.recipient_id ?? 0);
        if (Number.isFinite(upToId) && upToId > 0 && Number.isFinite(recipientId) && recipientId > 0) {
          try { applyDelivered(upToId, recipientId, myUserId); } catch {}
        }
        return;
      }

      if ((type === 'reaction_added' || type === 'reaction_removed') && applyReactionEvent) {
        try {
          const p = (payload?.payload || payload) as any;
          const mid = Number(p?.message_id ?? 0);
          const userId = Number(p?.user_id ?? 0);
          const emoji = (p?.emoji || '').toString();
          // Skip applying our own reaction event to avoid double-applying
          if (Number.isFinite(userId) && Number(userId) === Number(myUserId)) return;
          if (Number.isFinite(mid) && mid > 0 && emoji) {
            applyReactionEvent({ messageId: mid, emoji, userId, kind: type === 'reaction_added' ? 'added' : 'removed' });
          }
        } catch {}
        return;
      }

      if (type === 'message_deleted' && applyMessageDeleted) {
        const mid = Number(payload?.id ?? payload?.message_id ?? 0);
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
  }, [threadId, isActive, subscribe, ingestMessage, applyReadReceipt, myUserId]);
}
